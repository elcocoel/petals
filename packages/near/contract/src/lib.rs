//! Petals' credit contract (Elco, 9 Nov: a small NEAR contract holds each person's deposit, and they
//! withdraw unused NEAR themselves, so Petals holds nobody's money).
//!
//! - `deposit`: a person sends NEAR with the call; it goes onto their own balance, under their own account.
//!   Storing a new balance costs a little NEAR, which comes out of the first deposit.
//! - `withdraw`: the person takes back some or all of their balance, any time, with nobody's permission.
//! - `charge`: what a turn of Petals' agent cost moves from a person's balance to what Petals has earned.
//!   Only the charger account (Petals' server) may call it, never more than the balance, and it can't send
//!   NEAR anywhere.
//! - `claim`: the owner (Elco's account) takes what has been earned.
//!
//! The server's key is a function-call key on the charger account that can call `charge` on this contract
//! and nothing else, and can't attach NEAR. Whoever held it could only move people's balances into what
//! Petals has earned, where the owner can see and give it back; never to themselves.
use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{
    assert_one_yocto, env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault,
    Promise,
};

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum Key {
    Balances,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Credit {
    /// Elco's account: it takes what has been earned
    owner: AccountId,
    /// Petals' server: it may charge, and do nothing else
    charger: AccountId,
    /// each person's NEAR, in yoctoNEAR, under their own account
    balances: LookupMap<AccountId, u128>,
    /// charged and not yet claimed, in yoctoNEAR
    earned: u128,
}

#[near(serializers = [json])]
pub struct Config {
    pub owner: AccountId,
    pub charger: AccountId,
}

#[near]
impl Credit {
    #[init]
    pub fn new(owner: AccountId, charger: AccountId) -> Self {
        Self {
            owner,
            charger,
            balances: LookupMap::new(Key::Balances),
            earned: 0,
        }
    }

    /// Adds the NEAR sent with this call to the caller's balance, less what storing a new balance costs.
    /// Returns the balance after.
    #[payable]
    pub fn deposit(&mut self) -> U128 {
        let who = env::predecessor_account_id();
        let attached = env::attached_deposit().as_yoctonear();
        require!(attached > 0, "Send some NEAR with the deposit.");
        let before = env::storage_usage();
        let had = self.balances.get(&who).copied();
        let mut cost = 0;
        if had.is_none() {
            self.balances.insert(who.clone(), 0);
            self.balances.flush();
            let added = env::storage_usage().saturating_sub(before) as u128;
            cost = added * env::storage_byte_cost().as_yoctonear();
            require!(attached > cost, "The deposit doesn't cover storing your balance.");
        }
        let balance = had.unwrap_or(0) + attached - cost;
        self.balances.insert(who, balance);
        U128(balance)
    }

    /// Sends the caller `amount` of their balance, or all of it. Needs exactly 1 yoctoNEAR attached, so
    /// only the person's own wallet, with a full-access key, can do it; that yoctoNEAR comes back too.
    #[payable]
    pub fn withdraw(&mut self, amount: Option<U128>) -> Promise {
        assert_one_yocto();
        let who = env::predecessor_account_id();
        let balance = self.balances.get(&who).copied().unwrap_or(0);
        let amount = amount.map(|a| a.0).unwrap_or(balance);
        require!(amount > 0, "There's nothing to withdraw.");
        require!(amount <= balance, "That's more than your balance.");
        self.balances.insert(who.clone(), balance - amount);
        Promise::new(who).transfer(NearToken::from_yoctonear(amount + 1))
    }

    /// Moves up to `amount` from `account_id`'s balance to what Petals has earned. Charger only. Returns
    /// what it moved: the balance, when that's less.
    pub fn charge(&mut self, account_id: AccountId, amount: U128) -> U128 {
        require!(
            env::predecessor_account_id() == self.charger,
            "Only Petals' server charges."
        );
        let Some(balance) = self.balances.get(&account_id).copied() else {
            return U128(0);
        };
        let charged = amount.0.min(balance);
        self.balances.insert(account_id, balance - charged);
        self.earned += charged;
        U128(charged)
    }

    /// Sends the owner what has been earned. Owner only, with 1 yoctoNEAR attached.
    #[payable]
    pub fn claim(&mut self) -> Promise {
        assert_one_yocto();
        require!(env::predecessor_account_id() == self.owner, "Only the owner claims.");
        let amount = self.earned;
        require!(amount > 0, "Nothing has been earned.");
        self.earned = 0;
        Promise::new(self.owner.clone()).transfer(NearToken::from_yoctonear(amount + 1))
    }

    pub fn balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.balances.get(&account_id).copied().unwrap_or(0))
    }

    pub fn earned(&self) -> U128 {
        U128(self.earned)
    }

    pub fn config(&self) -> Config {
        Config {
            owner: self.owner.clone(),
            charger: self.charger.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    const NEAR: u128 = 10u128.pow(24);

    fn account(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    fn as_caller(who: &str, attached: u128) {
        testing_env!(VMContextBuilder::new()
            .current_account_id(account("credit.petals.testnet"))
            .predecessor_account_id(account(who))
            .signer_account_id(account(who))
            .attached_deposit(NearToken::from_yoctonear(attached))
            .build());
    }

    fn contract() -> Credit {
        as_caller("petals.testnet", 0);
        Credit::new(account("petals.testnet"), account("charger.testnet"))
    }

    #[test]
    fn a_first_deposit_pays_for_storing_the_balance_and_a_second_doesnt() {
        let mut c = contract();
        as_caller("alice.testnet", NEAR);
        let first = c.deposit().0;
        assert!(first < NEAR && first > NEAR - NEAR / 100, "{first}");
        as_caller("alice.testnet", NEAR);
        assert_eq!(c.deposit().0, first + NEAR);
        assert_eq!(c.balance_of(account("alice.testnet")).0, first + NEAR);
        assert_eq!(c.balance_of(account("bob.testnet")).0, 0);
    }

    #[test]
    #[should_panic(expected = "Send some NEAR")]
    fn a_deposit_needs_near() {
        let mut c = contract();
        as_caller("alice.testnet", 0);
        c.deposit();
    }

    #[test]
    fn the_person_withdraws_some_or_all() {
        let mut c = contract();
        as_caller("alice.testnet", NEAR);
        let had = c.deposit().0;
        as_caller("alice.testnet", 1);
        c.withdraw(Some(U128(NEAR / 4)));
        assert_eq!(c.balance_of(account("alice.testnet")).0, had - NEAR / 4);
        as_caller("alice.testnet", 1);
        c.withdraw(None);
        assert_eq!(c.balance_of(account("alice.testnet")).0, 0);
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn a_withdrawal_needs_the_wallet_itself() {
        let mut c = contract();
        as_caller("alice.testnet", NEAR);
        c.deposit();
        as_caller("alice.testnet", 0);
        c.withdraw(None);
    }

    #[test]
    #[should_panic(expected = "more than your balance")]
    fn nobody_withdraws_more_than_they_have() {
        let mut c = contract();
        as_caller("alice.testnet", NEAR);
        c.deposit();
        as_caller("alice.testnet", 1);
        c.withdraw(Some(U128(2 * NEAR)));
    }

    #[test]
    fn the_charger_charges_up_to_the_balance_into_earned() {
        let mut c = contract();
        as_caller("alice.testnet", NEAR);
        let had = c.deposit().0;
        as_caller("charger.testnet", 0);
        assert_eq!(c.charge(account("alice.testnet"), U128(NEAR / 10)).0, NEAR / 10);
        assert_eq!(c.balance_of(account("alice.testnet")).0, had - NEAR / 10);
        assert_eq!(c.charge(account("alice.testnet"), U128(5 * NEAR)).0, had - NEAR / 10);
        assert_eq!(c.balance_of(account("alice.testnet")).0, 0);
        assert_eq!(c.earned().0, had);
        assert_eq!(c.charge(account("nobody.testnet"), U128(1)).0, 0);
    }

    #[test]
    #[should_panic(expected = "Only Petals' server charges")]
    fn nobody_else_charges() {
        let mut c = contract();
        as_caller("alice.testnet", NEAR);
        c.deposit();
        as_caller("alice.testnet", 0);
        c.charge(account("alice.testnet"), U128(1));
    }

    #[test]
    fn the_owner_claims_what_was_earned() {
        let mut c = contract();
        as_caller("alice.testnet", NEAR);
        c.deposit();
        as_caller("charger.testnet", 0);
        c.charge(account("alice.testnet"), U128(NEAR / 2));
        as_caller("petals.testnet", 1);
        c.claim();
        assert_eq!(c.earned().0, 0);
    }

    #[test]
    #[should_panic(expected = "Only the owner claims")]
    fn nobody_else_claims() {
        let mut c = contract();
        as_caller("alice.testnet", NEAR);
        c.deposit();
        as_caller("charger.testnet", 0);
        c.charge(account("alice.testnet"), U128(NEAR / 2));
        as_caller("charger.testnet", 1);
        c.claim();
    }
}
