export type TelephonyCallPayload = {
  phone: string;
  leadId?: number;
};

export async function startCall(_payload: TelephonyCallPayload) {
  throw new Error("Telephony integration is not connected yet");
}
