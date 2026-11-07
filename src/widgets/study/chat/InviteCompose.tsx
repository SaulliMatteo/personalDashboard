import { useState } from "react";
import type { ChatComposeProps } from "../../../core/widgets/chatActions";
import { ChatComposeField, ChatComposeFoot } from "../../../ui/ChatCompose";
import { colorForSubject } from "../lib/colors";
import { useTimer } from "../timer/useTimer";
import { invitePayload } from "./invitePayload";
import "./InviteChat.css";

/** "Invita a studiare": materia (tra le proprie, facoltativa) e ora (facoltativa, vuota = adesso). */
function InviteCompose({ send, onClose }: ChatComposeProps) {
  const { subjects, subjectId } = useTimer();
  const [chosen, setChosen] = useState<string>(subjectId !== null ? String(subjectId) : "");
  const [at, setAt] = useState("");

  const index = subjects.findIndex((s) => String(s.id) === chosen);
  const subject = index >= 0 ? subjects[index] : null;
  const payload = invitePayload({
    subject: subject ? { name: subject.name, color: colorForSubject(subject, index) } : null,
    at: /^\d{2}:\d{2}$/.test(at) ? at : null,
  });

  return (
    <>
      <div className="stc-fields">
        <ChatComposeField label="Materia">
          <select value={chosen} onChange={(e) => setChosen(e.target.value)}>
            <option value="">Nessuna in particolare</option>
            {subjects.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
        </ChatComposeField>
        <ChatComposeField label="Ora (vuota = adesso)">
          <input type="time" value={at} onChange={(e) => setAt(e.target.value)} />
        </ChatComposeField>
      </div>
      <ChatComposeFoot payload={payload} send={send} onClose={onClose} />
    </>
  );
}

export default InviteCompose;
