import { MdArrowBack } from "react-icons/md";
import "./BackButton.css";

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
