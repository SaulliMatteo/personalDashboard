import { MdOndemandVideo } from "react-icons/md";
import { defineChatAction } from "../../../core/widgets/chatActions";
import VideoCard from "./VideoCard";
import VideoCompose from "./VideoCompose";
import { VIDEO_KIND, parseVideoPayload } from "./videoPayload";

/** "Consiglia un video" nella chat degli amici. */
export const videoChatAction = defineChatAction({
  kind: VIDEO_KIND,
  label: "Consiglia un video",
  hint: "Dai tuoi video o da un link",
  composeTitle: (friend) => `Consiglia un video a ${friend}`,
  icon: MdOndemandVideo,
  parse: parseVideoPayload,
  describe: (p) => `🎬 ${p.title}`,
  Compose: VideoCompose,
  Card: VideoCard,
});
