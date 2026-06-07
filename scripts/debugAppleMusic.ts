import { mintAppleDeveloperToken } from "../src/lib/apple-music";

const devToken = mintAppleDeveloperToken();
const userToken = process.env.APPLE_MUSIC_USER_TOKEN;
if (!userToken) throw new Error("APPLE_MUSIC_USER_TOKEN missing");

const url = "https://api.music.apple.com/v1/me/recent/played/tracks?limit=10";
const resp = await fetch(url, {
  headers: {
    Authorization: `Bearer ${devToken}`,
    "Music-User-Token": userToken,
  },
});
console.log("status:", resp.status);
const body = await resp.text();
console.log("body:", body.slice(0, 2000));
