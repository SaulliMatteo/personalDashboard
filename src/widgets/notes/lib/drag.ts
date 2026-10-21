/** Elemento trascinabile nel Notes: una nota o una cartella. */
export interface DragItem {
  kind: "note" | "folder";
  id: number;
  label: string;
}
