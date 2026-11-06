// A place the copy leaves open (yellow in the copy doc): the space is built, with no words in it. A hairline
// shows where it is. `fill` takes the height of whatever sits beside it, for a split's figure column.
export function EmptySlot({ fill = false }: { fill?: boolean }) {
  return (
    <div
      aria-hidden
      className={`w-full border border-hairline ${fill ? 'h-full min-h-figure-height self-stretch' : 'h-figure-height'}`}
    />
  );
}
