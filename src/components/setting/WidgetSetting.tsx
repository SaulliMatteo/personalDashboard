import { useLayout } from "../../context/LayoutContext";
import { useNav } from "../../context/NavContext";

interface WidgetSettingProps {
  /** Chiude il modale Settings quando si passa al catalogo widget (pagina separata). */
  onClose: () => void;
}

const WidgetSetting = ({ onClose }: WidgetSettingProps) => {
  const { resetLayout } = useLayout();
  const { goToCatalog } = useNav();

  const handleOpenCatalog = () => {
    onClose();
    goToCatalog();
  };

  return (
    <div className="flex flex-col mt-10 gap-6">
      <div className="option flex flex-row justify-around items-center">
        reset posizione widget
        <button
          onClick={resetLayout}
          className="text-[#131318] font-bold bg-white p-1 px-4 rounded-xl hover:cursor-pointer hover:bg-[var(--text-primary)]"
        >
          reset
        </button>
      </div>

      <div className="option flex flex-row justify-around items-center">
        aggiungi o rimuovi widget dalla dashboard
        <button
          onClick={handleOpenCatalog}
          className="text-[#131318] font-bold bg-white p-1 px-4 rounded-xl hover:cursor-pointer hover:bg-[var(--text-primary)]"
        >
          gestisci widget
        </button>
      </div>
    </div>
  );
};

export default WidgetSetting;
