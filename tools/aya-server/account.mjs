import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
export function playerNameForProfile(profile, email = "") {
  if (profile?.role === "teacher") {
    const name = String(email || profile.email || "")
      .trim()
      .split("@")[0];
    if (!/^[\p{L}\p{N}_.+ -]{1,64}$/u.test(name))
      throw new Error("교사 계정명을 확인할 수 없습니다.");
    return name;
  }
  if (profile?.role !== "student")
    throw new Error("에이두 학생 또는 교사 계정이 필요합니다.");
  const code = String(
    profile.userCode ??
      profile.code ??
      profile.studentCode ??
      (email.endsWith("@abc.com") ? email.split("@")[0] : ""),
  ).trim();
  if (!/^\d{1,12}$/.test(code)) throw new Error("학생 코드가 필요합니다.");
  return `aiedue${code}`;
}
export function createAccountVerifier({
  dataOrigin = "http://127.0.0.1:3050",
  identityFile,
  fetchImpl = fetch,
} = {}) {
  let ids =
    identityFile && fs.existsSync(identityFile)
      ? JSON.parse(fs.readFileSync(identityFile, "utf8"))
      : { next: 100000, users: {} };
  return async (token) => {
    if (
      typeof token !== "string" ||
      token.length > 12000 ||
      token.split(".").length !== 3
    )
      throw new Error("로그인이 필요합니다.");
    let claims;
    try {
      claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
    } catch {
      throw new Error("잘못된 로그인 토큰입니다.");
    }
    const uid = claims.sub;
    if (
      typeof uid !== "string" ||
      !uid ||
      uid.length > 128 ||
      !Number.isFinite(claims.exp) ||
      claims.exp * 1000 <= Date.now()
    )
      throw new Error("로그인을 다시 해 주세요.");
    // The canonical data server verifies the Firebase signature/audience/issuer
    // and enforces document ACL; unverified routing claims alone grant nothing.
    const r = await fetchImpl(
      `${dataOrigin}/db-api/korean/v2/documents/users/${encodeURIComponent(uid)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!r.ok)
      throw new Error("에이두 로그인 또는 프로필을 확인할 수 없습니다.");
    const value = await r.json(),
      doc = value.document;
    if (doc?.path !== `users/${uid}` || !doc.data)
      throw new Error("에이두 프로필이 필요합니다.");
    const profile = doc.data;
    if (
      profile.email &&
      claims.email &&
      profile.email.toLowerCase() !== claims.email.toLowerCase()
    )
      throw new Error("계정 정보가 일치하지 않습니다.");
    const name = playerNameForProfile(
      profile,
      claims.email || profile.email || "",
    );
    if (!ids.users[uid]) {
      if (ids.next >= 2147483647)
        throw new Error("게임 계정 공간이 가득 찼습니다.");
      ids.users[uid] = ids.next++;
      if (identityFile) {
        fs.mkdirSync(path.dirname(identityFile), { recursive: true });
        fs.writeFileSync(identityFile + ".tmp", JSON.stringify(ids), {
          mode: 0o600,
        });
        fs.renameSync(identityFile + ".tmp", identityFile);
      }
    }
    return {
      uid,
      name,
      userId: ids.users[uid],
      role: profile.role,
      expires: Math.min(claims.exp * 1000, Date.now() + 2 * 60 * 60 * 1000),
    };
  };
}
