import { MdArrowBack } from "react-icons/md";
import "../../css/shared.css";

interface BackButtonProps {
  onClick: () => void;
  label?: string;
}

function BackButton({ onClick, label = "Indietro" }: BackButtonProps) {
  return (
    <button type="button" className="detail-back-btn" onClick={onClick}>
      <MdArrowBack /> {label}
    </button>
  );
}

export default BackButton;
