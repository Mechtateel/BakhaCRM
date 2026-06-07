export type AiManagerContext = {
  leadId: number;
  message: string;
};

export async function suggestManagerReply(_context: AiManagerContext) {
  return "AI-менеджер будет подключён после настройки провайдера.";
}
