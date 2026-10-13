import { EditSurface } from "@/components/pages/edit-surface";

// /p/_edit: the canvas of the console's visual editor. Empty until the editor
// builds the page into it (it is same-origin and works on the DOM directly).

export const metadata = { title: "Editor", robots: { index: false, follow: false } };

export default function EditPage() {
  return <EditSurface />;
}
