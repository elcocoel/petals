---

title: How the interface stays manageable
order: 60
---

Petals has many surfaces: the landing, the Power Map, a map’s page, /make, the side panel and these docs. They stay one interface because each design value, each behaviour and each data shape has one home, and a check refuses anything that goes around it.

## One source for every design value

Every colour, type style, space and line width comes from [the design tokens](https://github.com/elcocoel/petals/blob/main/packages/tokens/source.ts): one typed file, its names the same as the Figma file’s. It’s emitted as CSS and a Tailwind theme, and checked on every run for being up to date and for contrast: words reach 4.5 to 1 against the surface they sit on. Every gap, inset and padding is one of nine steps. Code asks for a role, such as the primary text colour, never a raw value.

A version’s softness, its corners, shadows and gradients, has one home too: `packages/tokens/versions/`.

## One behaviour, one component

A button, a field, a menu, a floating box, a badge: each lives once, in `apps/web/components/ui/`, and every page is built from them.

## The literal scan

`scripts/check-literals.ts` reads the site’s code on every check and fails on a raw colour, an arbitrary Tailwind value, an inline colour or size style, a primitive colour used directly, a rounded corner, a shadow, gradient or radius outside the versions, a raw button or link styled outside the components, and a stylesheet class that isn’t on its list. It’s strict, with no ratchet: no list of old exceptions it lets through. The one escape is a comment on the same line that gives its reason.

## TypeScript end to end, and a schema for every shape

The site, the server, the tools, the command line and the Node scripts are TypeScript, type-checked together on every check; Node runs the scripts as TypeScript directly.

Every format in the data protocol is a JSON Schema with a versioned id. Each is pinned to a real example by its hash, every example must validate, and a version once pinned keeps its schema, so old documents stay readable. See [the data protocol](/docs/data-protocol).

## One renderer for every petal

Every petal comes from three things: its data, a view (which piece of data each dimension shows), and the person’s own settings. One reader turns the data and the view into what each petal is, and one look draws it from the same marks, live on the map or as a still picture. See [the rendering protocol](/docs/rendering-protocol).
