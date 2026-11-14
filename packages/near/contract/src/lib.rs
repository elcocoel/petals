//! Petals' credit contract: a small contract holds each person's deposit and they withdraw it themselves,
//! so Petals holds nobody's money.
//!
//! - `deposit`: a person sends NEAR with the call; it goes onto their own balance, under their own account.
//!   Storing a new balance costs a little NEAR, which comes out of the first deposit.
//! - `withdraw`: the person takes back some or all of their balance, any time, with nobody's permission.
//! - `charge`: what a turn of Petals' agent cost moves from a person's balance to what Petals has earned.
//!   Only the charger account (Petals' server) may call it, never more than the balance, and it can't send
//!   NEAR anywhere.
//! - `claim`: the owner takes what has been earned.
//! - `ft_on_transfer`: wNEAR sent with `ft_transfer_call` (how NEAR Intents delivers a top-up paid in any token)
//!   goes onto the NEAR balance of the account its message names, or the sender's with no message, less what
//!   storing a new balance costs, and is unwrapped to NEAR at once: everyone's balance is NEAR, withdrawn as
//!   NEAR. What names no account is kept apart, unassigned, never sent back, and only the charger credits it
//!   to someone (`assign`). `unwrap` converts whatever wNEAR it still holds; anyone may call it.
//! - `upgrade`: the owner deploys a new build over this one, with 1 yoctoNEAR attached; its `migrate` reads the
//!   state as it was, and a build that can't read it changes nothing.
//!
//! The server's key is a function-call key on the charger account that can call `charge` on this contract
//! and nothing else, and can't attach NEAR. Whoever held it could only move people's balances into what
//! Petals has earned, where the owner can see and give it back; never to themselves.
//!
//! During Petals' first wave the contract's account keeps the owner's own wallet key, so the owner can deploy a
//! new build over it (upgradable by Petals); every build keeps `withdraw`, and people can always withdraw.
use near_sdk::borsh::BorshDeserialize;
use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{
    assert_one_yocto, env, near, require, AccountId, BorshStorageKey, Gas, NearToken,
    PanicOnDefault, Promise, PromiseOrValue,
};

/// NEAR's wrapped NEAR on mainnet: what NEAR Intents delivers for NEAR.
const MAINNET_WNEAR: &str = "wrap.near";
const GAS_UNWRAP: Gas = Gas::from_tgas(10);
const GAS_MIGRATE: Gas = Gas::from_tgas(50);
/// What wrap.near asks to keep this contract's own wNEAR account (NEP-145, registration only).
const WNEAR_STORAGE: NearToken = NearToken::from_yoctonear(1_250_000_000_000_000_000_000);

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum Key {
    Balances,
}

/// The state as version 1 kept it: read once, when a version-2 build is deployed over it.
#[near(serializers = [borsh])]
struct CreditV1 {
    owner: AccountId,
    charger: AccountId,
    balances: LookupMap<AccountId, u128>,
    earned: u128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Credit {
    /// The owner's account: it takes what has been earned
    owner: AccountId,
    /// Petals' server: it may charge, and do nothing else
    charger: AccountId,
    /// each person's NEAR, in yoctoNEAR, under their own account
    balances: LookupMap<AccountId, u128>,
    /// charged and not yet claimed, in yoctoNEAR
    earned: u128,
    /// the wrapped-NEAR contract whose tokens it takes and unwraps
    wnear: AccountId,
    /// NEAR received with no account it could be credited to, kept apart until the charger assigns it
    unassigned: u128,
}

#[near(serializers = [json])]
pub struct Config {
    pub owner: AccountId,
    pub charger: AccountId,
    pub wnear: AccountId,
}

/// The account a transfer's message names: a bare account id, or `{"account": "…"}`.
fn named_account(msg: &str) -> Option<AccountId> {
    let m = msg.trim();
    if m.starts_with('{') {
        #[near(serializers = [json])]
        struct For {
            account: String,
        }
        return near_sdk::serde_json::from_str::<For>(m)
            .ok()
            .and_then(|f| f.account.parse().ok());
    }
    m.parse().ok()
}

#[near]
impl Credit {
    #[init]
    pub fn new(owner: AccountId, charger: AccountId, wnear: Option<AccountId>) -> Self {
        let wnear = wnear.unwrap_or_else(|| MAINNET_WNEAR.parse().unwrap());
        register_with(&wnear);
        Self {
            owner,
            charger,
            balances: LookupMap::new(Key::Balances),
            earned: 0,
            wnear,
            unassigned: 0,
        }
    }

    /// Reads the state the build before this one kept: version 1's becomes version 2's, everyone's NEAR as it
    /// was; version 2's stays as it is. Only this contract calls it, as `upgrade` or the first deploy runs it.
    #[private]
    #[init(ignore_state)]
    pub fn migrate(wnear: Option<AccountId>) -> Self {
        let raw = env::storage_read(b"STATE")
            .unwrap_or_else(|| env::panic_str("There is no state to read."));
        if let Ok(v2) = Credit::try_from_slice(&raw) {
            return v2;
        }
        let v1 = CreditV1::try_from_slice(&raw)
            .unwrap_or_else(|_| env::panic_str("This build can't read the state it found."));
        let wnear = wnear.unwrap_or_else(|| MAINNET_WNEAR.parse().unwrap());
        register_with(&wnear);
        Self {
            owner: v1.owner,
            charger: v1.charger,
            balances: v1.balances,
            earned: v1.earned,
            wnear,
            unassigned: 0,
        }
    }

    /// Deploys a new build over this one, sent as this call's input, and runs its `migrate`. Owner only, with
    /// 1 yoctoNEAR attached. A build whose `migrate` can't read the state fails, and nothing changes.
    #[payable]
    pub fn upgrade(&mut self) -> Promise {
        assert_one_yocto();
        require!(
            env::predecessor_account_id() == self.owner,
            "Only the owner upgrades."
        );
        let code =
            env::input().unwrap_or_else(|| env::panic_str("Send the new build as the input."));
        Promise::new(env::current_account_id())
            .deploy_contract(code)
            .function_call(
                "migrate".to_string(),
                b"{}".to_vec(),
                NearToken::from_yoctonear(0),
                GAS_MIGRATE,
            )
    }

    /// `amount` onto `who`'s balance, less what storing a new balance costs. The balance after.
    fn credit(&mut self, who: AccountId, amount: u128) -> u128 {
        let before = env::storage_usage();
        let had = self.balances.get(&who).copied();
        let mut cost = 0;
        if had.is_none() {
            self.balances.insert(who.clone(), 0);
            self.balances.flush();
            let added = env::storage_usage().saturating_sub(before) as u128;
            cost = added * env::storage_byte_cost().as_yoctonear();
            require!(
                amount > cost,
                "The deposit doesn't cover storing your balance."
            );
        }
        let balance = had.unwrap_or(0) + amount - cost;
        self.balances.insert(who, balance);
        balance
    }

    /// Adds the NEAR sent with this call to the caller's balance, less what storing a new balance costs.
    /// Returns the balance after.
    #[payable]
    pub fn deposit(&mut self) -> U128 {
        let attached = env::attached_deposit().as_yoctonear();
        require!(attached > 0, "Send some NEAR with the deposit.");
        U128(self.credit(env::predecessor_account_id(), attached))
    }

    /// wNEAR received (NEP-141's `ft_transfer_call`, as NEAR Intents delivers a top-up): onto the NEAR balance of
    /// the account the message names, or the sender's with no message, and unwrapped to NEAR. One it can't name
    /// an account for is kept apart, unassigned. All of it is kept: nothing goes back.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        require!(
            env::predecessor_account_id() == self.wnear,
            "Only wNEAR is taken here."
        );
        let to = if msg.trim().is_empty() {
            Some(sender_id)
        } else {
            named_account(&msg)
        };
        match to {
            Some(account)
                if self.balances.contains_key(&account) || amount.0 > storage_of_one() =>
            {
                self.credit(account, amount.0);
            }
            _ => self.unassigned += amount.0,
        }
        let _ = self.unwrap_now(amount.0);
        PromiseOrValue::Value(U128(0))
    }

    /// Credits `amount` of the unassigned NEAR to `account_id`, the one a top-up was for. Charger only; it can only
    /// credit someone, never take.
    pub fn assign(&mut self, account_id: AccountId, amount: U128) -> U128 {
        require!(
            env::predecessor_account_id() == self.charger,
            "Only Petals' server assigns."
        );
        require!(
            amount.0 <= self.unassigned,
            "That's more than is unassigned."
        );
        self.unassigned -= amount.0;
        U128(self.credit(account_id, amount.0))
    }

    /// Unwraps `amount` of the wNEAR it holds, or what's asked, into NEAR. Anyone may: it only turns this
    /// contract's own wNEAR into the NEAR it already counts.
    pub fn unwrap(&mut self, amount: U128) -> Promise {
        self.unwrap_now(amount.0)
    }

    fn unwrap_now(&self, amount: u128) -> Promise {
        Promise::new(self.wnear.clone()).function_call(
            "near_withdraw".to_string(),
            near_sdk::serde_json::json!({ "amount": U128(amount) })
                .to_string()
                .into_bytes(),
            NearToken::from_yoctonear(1),
            GAS_UNWRAP,
        )
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
        require!(
            env::predecessor_account_id() == self.owner,
            "Only the owner claims."
        );
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

    pub fn unassigned(&self) -> U128 {
        U128(self.unassigned)
    }

    pub fn config(&self) -> Config {
        Config {
            owner: self.owner.clone(),
            charger: self.charger.clone(),
            wnear: self.wnear.clone(),
        }
    }
}

/// What storing one new balance costs, as a first deposit pays it.
fn storage_of_one() -> u128 {
    // an account id of up to 64 bytes, its balance, the map's prefix and the record's own overhead: under 200
    200 * env::storage_byte_cost().as_yoctonear()
}

/// Registers this contract with the wNEAR contract once (registration only; already registered, it's returned).
fn register_with(wnear: &AccountId) {
    // scheduled as it's made: an init can't return a promise, and doesn't need to
    let _ = Promise::new(wnear.clone()).function_call(
        "storage_deposit".to_string(),
        near_sdk::serde_json::json!({ "account_id": env::current_account_id(), "registration_only": true })
            .to_string()
            .into_bytes(),
        WNEAR_STORAGE,
        Gas::from_tgas(10),
    );
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
        Credit::new(
            account("petals.testnet"),
            account("charger.testnet"),
            Some(account("wrap.testnet")),
        )
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
        assert_eq!(
            c.charge(account("alice.testnet"), U128(NEAR / 10)).0,
            NEAR / 10
        );
        assert_eq!(c.balance_of(account("alice.testnet")).0, had - NEAR / 10);
        assert_eq!(
            c.charge(account("alice.testnet"), U128(5 * NEAR)).0,
            had - NEAR / 10
        );
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
    #[test]
    fn wnear_from_intents_lands_on_the_named_accounts_near_less_storing_it() {
        let mut c = contract();
        as_caller("wrap.testnet", 0);
        c.ft_on_transfer(
            account("intents.testnet"),
            U128(NEAR),
            "alice.testnet".into(),
        );
        let first = c.balance_of(account("alice.testnet")).0;
        assert!(first < NEAR && first > NEAR - NEAR / 100, "{first}");
        c.ft_on_transfer(
            account("intents.testnet"),
            U128(NEAR),
            r#"{"account":"alice.testnet"}"#.into(),
        );
        assert_eq!(c.balance_of(account("alice.testnet")).0, first + NEAR);
        // a person sends their own wNEAR, with no message
        c.ft_on_transfer(account("bob.testnet"), U128(NEAR), String::new());
        assert!(c.balance_of(account("bob.testnet")).0 > 0);
        assert_eq!(c.balance_of(account("intents.testnet")).0, 0);
        // a message naming no account: kept apart, for the charger to assign
        c.ft_on_transfer(
            account("intents.testnet"),
            U128(NEAR / 2),
            "not an account!".into(),
        );
        assert_eq!(c.unassigned().0, NEAR / 2);
        as_caller("charger.testnet", 0);
        c.assign(account("carol.testnet"), U128(NEAR / 2));
        assert_eq!(c.unassigned().0, 0);
        assert!(c.balance_of(account("carol.testnet")).0 > 0);
        // and it's withdrawn as NEAR, as any deposit
        as_caller("alice.testnet", 1);
        c.withdraw(None);
        assert_eq!(c.balance_of(account("alice.testnet")).0, 0);
    }

    #[test]
    fn too_little_for_a_new_balance_is_kept_apart_not_lost() {
        let mut c = contract();
        as_caller("wrap.testnet", 0);
        c.ft_on_transfer(
            account("intents.testnet"),
            U128(1_000),
            "alice.testnet".into(),
        );
        assert_eq!(c.balance_of(account("alice.testnet")).0, 0);
        assert_eq!(c.unassigned().0, 1_000);
    }

    #[test]
    #[should_panic(expected = "Only wNEAR is taken here")]
    fn another_token_is_refused() {
        let mut c = contract();
        as_caller("fake-wrap.testnet", 0);
        c.ft_on_transfer(account("alice.testnet"), U128(NEAR), String::new());
    }

    #[test]
    #[should_panic(expected = "more than is unassigned")]
    fn the_charger_assigns_only_what_is_unassigned() {
        let mut c = contract();
        as_caller("charger.testnet", 0);
        c.assign(account("charger.testnet"), U128(1));
    }

    #[test]
    #[should_panic(expected = "Only Petals' server assigns")]
    fn nobody_else_assigns() {
        let mut c = contract();
        as_caller("wrap.testnet", 0);
        c.ft_on_transfer(account("intents.testnet"), U128(10), "?".into());
        as_caller("alice.testnet", 0);
        c.assign(account("alice.testnet"), U128(10));
    }

    #[test]
    fn a_version_one_state_reads_as_version_two_with_every_balance_kept() {
        as_caller("credit.petals.testnet", 0);
        let mut v1 = CreditV1 {
            owner: account("petals.testnet"),
            charger: account("charger.testnet"),
            balances: LookupMap::new(Key::Balances),
            earned: 7,
        };
        v1.balances.insert(account("alice.testnet"), 42);
        v1.balances.flush();
        env::state_write(&v1);
        let c = Credit::migrate(Some(account("wrap.testnet")));
        assert_eq!(c.balance_of(account("alice.testnet")).0, 42);
        assert_eq!(c.earned().0, 7);
        assert_eq!(c.config().wnear, account("wrap.testnet"));
        // a version-two state stays as it is
        env::state_write(&c);
        let again = Credit::migrate(None);
        assert_eq!(again.config().wnear, account("wrap.testnet"));
        assert_eq!(again.balance_of(account("alice.testnet")).0, 42);
    }

    #[test]
    #[should_panic(expected = "Only the owner upgrades")]
    fn nobody_else_upgrades() {
        let mut c = contract();
        as_caller("alice.testnet", 1);
        c.upgrade();
    }
}
