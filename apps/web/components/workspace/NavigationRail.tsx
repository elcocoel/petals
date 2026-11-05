// Workspace / Navigation rail 43:748. Home and New question as in Figma; the other two so nothing is
// unreachable from here.
import { TextLink } from '../ui/TextLink.tsx';

export function NavigationRail() {
  return (
    <nav
      aria-label="Workspace"
      className="flex shrink-0 flex-wrap justify-between gap-x-block-gap bg-hairline px-block-gap py-text-gap wide:w-rail-width wide:flex-col wide:flex-nowrap wide:pt-space-32 wide:pr-0 wide:pb-space-32"
    >
      <div className="flex flex-wrap gap-x-block-gap wide:flex-col wide:gap-space-8">
        <TextLink variant="rail" icon="home" href="/">
          Home
        </TextLink>
        <TextLink variant="rail" icon="plus" href="/make">
          New question
        </TextLink>
      </div>
      <div className="flex flex-wrap gap-x-block-gap wide:flex-col wide:gap-space-8">
        <TextLink variant="rail" icon="gallery" href="/gallery">
          Gallery
        </TextLink>
        <TextLink variant="rail" icon="connect" href="/connect">
          Use your own AI
        </TextLink>
      </div>
    </nav>
  );
}
