# Putting page actions in the header (HeaderSlot)

The header is a `__root` piece, but don't build page-specific buttons or status indicators as header pieces.
Doing so means touching page state from `__root`, which pushes it out into `src/lib` as "used by several routes".

Instead, build it on the page side (in that route's `-components/`) and render it wrapped in `<HeaderSlot>` from `@/components/HeaderSlot`.
It is portaled into the header's slot, so state can be passed as ordinary props within the page.
It disappears when the page is left, so "only while this page is open" comes for free.

See current usages with `grep -rn "<HeaderSlot" src`.

When asked to "show X in the header", first ask whether it depends on page state; if it does, use this pattern.
Things that don't depend on the page (login state, offline indicator, etc.) are `__root` pieces and go in `routes/(root)/-components/`.
