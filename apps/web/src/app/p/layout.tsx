import "@/components/pages/pages.css";

// Published pages: no Clerk, no console chrome. The brand kit supplies the
// fonts and colours per page, so this layout only loads the renderer's CSS.
export default function PublishedPagesLayout({ children }: LayoutProps<"/p">) {
  return <>{children}</>;
}
