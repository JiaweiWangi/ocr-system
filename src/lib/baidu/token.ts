/**
 * 百度 access_token 管理：内存缓存 + 到期前刷新 + 110/111 强刷
 *
 * token 有效期 30 天，按 expires_in 计算过期时间，提前 5 分钟刷新。
 */

interface TokenCache {
  token: string;
  expiresAt: number; // ms since epoch
}

let cache: TokenCache | null = null;

const TOKEN_URL = "https://aip.baidubce.com/oauth/2.0/token";

export class BaiduTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaiduTokenError";
  }
}

export function isTokenInvalidError(code: number): boolean {
  // 110: access_token 无效  111: access_token 过期
  return code === 110 || code === 111;
}

export function clearTokenCache(): void {
  cache = null;
}

export async function getAccessToken(forceRefresh = false): Promise<string> {
  const apiKey = process.env.BAIDU_API_KEY;
  const secretKey = process.env.BAIDU_SECRET_KEY;
  if (!apiKey || !secretKey) {
    throw new BaiduTokenError(
      "缺少 BAIDU_API_KEY / BAIDU_SECRET_KEY 环境变量（在 .env.local 中配置，见百度智能云控制台）",
    );
  }

  const now = Date.now();
  if (!forceRefresh && cache && cache.expiresAt - 5 * 60 * 1000 > now) {
    return cache.token;
  }

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: apiKey,
    client_secret: secretKey,
  });

  const res = await fetch(`${TOKEN_URL}?${params.toString()}`, { method: "POST" });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!data.access_token) {
    throw new BaiduTokenError(
      `获取 access_token 失败：${data.error ?? "unknown"} ${data.error_description ?? ""}`,
    );
  }

  cache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ?? 2592000) * 1000, // 默认 30 天
  };
  return cache.token;
}
