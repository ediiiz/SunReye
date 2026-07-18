// Bridges each (app) page's heading to the persistent top header in the shell
// layout. Pages set the title/subtitle from a reactive `$effect` so it tracks
// both navigation and locale change; the layout header reads these fields.
export const pageHeader = $state<{ title: string; subtitle?: string }>({ title: "" });

export function setPageHeader(title: string, subtitle?: string) {
  pageHeader.title = title;
  pageHeader.subtitle = subtitle;
}
