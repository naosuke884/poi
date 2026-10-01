import { Button, Stack } from "@mantine/core";
import { useLayoutEffect } from "react";
import { HeaderSlot } from "@/components/HeaderSlot";
import { SiteFooter } from "@/components/SiteFooter";
import { useGoogleLogin } from "../../-lib/use-google-login";
import { DemoVideo } from "./DemoVideo";
import { FeatureList } from "./FeatureList";
import { LandingHero } from "./LandingHero";

/**
 * 未ログインで / に来た人向けのランディング。何ができるか + デモ動画 + ログイン導線。
 * ログイン専用ページは無く、CTA がそのまま Google OAuth を開始する (同意文もここに置く)。
 * スクロールした先からも始められるよう、ヘッダーにもログインボタンを出す
 */
export function Landing() {
  // ルーターのスクロール復元は "/" を除外している (Board が自分で末尾へ合わせるため) ので、
  // 板以外を表示するときはここで先頭に戻す (例: /terms から戻ってきた場合)
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const googleLogin = useGoogleLogin();
  return (
    <Stack gap={72} py="xl" align="center">
      {/* ヘッダーのログイン (ほかのページの UserMenu の「ログイン」と同じ大きさ)。
          ここでは押すとそのまま Google のログインを始める */}
      <HeaderSlot>
        <Button
          size="compact-sm"
          loading={googleLogin.busy}
          onClick={() => void googleLogin.login()}
        >
          ログイン
        </Button>
      </HeaderSlot>
      <LandingHero googleLogin={googleLogin} />
      <DemoVideo />
      <FeatureList />
      <SiteFooter />
    </Stack>
  );
}
