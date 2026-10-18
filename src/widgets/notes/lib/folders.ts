import type { IconType } from "react-icons";
import {
  MdOutlineAutoAwesome,
  MdOutlineCoffee,
  MdOutlineEdit,
  MdOutlineExplore,
  MdOutlineFavoriteBorder,
  MdOutlineFolder,
  MdOutlineLayers,
  MdOutlineLightbulb,
  MdOutlineMenuBook,
  MdOutlineWorkOutline,
} from "react-icons/md";

export const FOLDER_ICONS: { key: string; Icon: IconType }[] = [
  { key: "folder", Icon: MdOutlineFolder },
  { key: "layers", Icon: MdOutlineLayers },
  { key: "briefcase", Icon: MdOutlineWorkOutline },
  { key: "book", Icon: MdOutlineMenuBook },
  { key: "bulb", Icon: MdOutlineLightbulb },
  { key: "sparkles", Icon: MdOutlineAutoAwesome },
  { key: "pencil", Icon: MdOutlineEdit },
  { key: "coffee", Icon: MdOutlineCoffee },
  { key: "compass", Icon: MdOutlineExplore },
  { key: "heart", Icon: MdOutlineFavoriteBorder },
];

export function folderIcon(key: string): IconType {
  return FOLDER_ICONS.find((i) => i.key === key)?.Icon ?? MdOutlineFolder;
}

export const FOLDER_COLORS = [
  { value: "#6c8dff", label: "Pervinca" },
  { value: "#7fc4a8", label: "Salvia" },
  { value: "#d9b36c", label: "Sabbia" },
  { value: "#e08aa0", label: "Rosa" },
  { value: "#a99be0", label: "Lavanda" },
  { value: "#8a8f98", label: "Grafite" },
] as const;
