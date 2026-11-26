import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "./supabase";

export function validateTeamPin(pin: string): string {
  const normalized = pin.trim();
  if (!/^\d{6,12}$/.test(normalized)) throw new Error("チームPINは6〜12桁の数字で設定してください。");
  return normalized;
}

export function hashTeamPin(pin: string): string {
  const normalized = validateTeamPin(pin);
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(normalized, salt, 32).toString("hex")}`;
}

export async function verifyTeamPin(teamId: string, pin: string): Promise<void> {
  const normalized = validateTeamPin(pin);
  const { data, error } = await supabaseAdmin()
    .from("team_result_credentials")
    .select("pin_hash")
    .eq("team_id", teamId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.pin_hash) throw new Error("このチームの結果入力PINが未設定です。主催者に設定を依頼してください。");
  const [salt, expectedHex] = String(data.pin_hash).split(":");
  if (!salt || !expectedHex) throw new Error("チームPINの設定が不正です。主催者に再設定を依頼してください。");
  const actual = scryptSync(normalized, salt, 32);
  const expected = Buffer.from(expectedHex, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("チームPINが違います。");
  }
}
