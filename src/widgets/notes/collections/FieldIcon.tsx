import {
  MdCheckBox,
  MdLink,
  MdOutlineArrowDropDownCircle,
  MdOutlineAttachFile,
  MdOutlineCalendarToday,
  MdOutlineDescription,
  MdOutlineLabel,
  MdOutlineNumbers,
  MdOutlineShortText,
} from "react-icons/md";
import type { FieldType } from "../lib/collections";

const ICONS = {
  text: MdOutlineShortText,
  number: MdOutlineNumbers,
  date: MdOutlineCalendarToday,
  select: MdOutlineArrowDropDownCircle,
  multi: MdOutlineLabel,
  check: MdCheckBox,
  url: MdLink,
  note: MdOutlineDescription,
  file: MdOutlineAttachFile,
} as const;

/** Icona del tipo di campo (mockup: .ft). */
function FieldIcon({ type }: { type: FieldType }) {
  const Icon = ICONS[type];
  return <Icon className="nq-ficon" aria-hidden="true" />;
}

export default FieldIcon;
