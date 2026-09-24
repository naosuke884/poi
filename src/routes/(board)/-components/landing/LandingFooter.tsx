import { Anchor, Text } from "@mantine/core";
import { Link } from "@tanstack/react-router";

export function LandingFooter() {
  return (
    <Text size="xs" c="dimmed" ta="center" mt="xl">
      © {new Date().getFullYear()} poi{" ・ "}
      <Anchor
        href="https://github.com/naosuke884/poi"
        target="_blank"
        rel="noopener noreferrer"
        size="xs"
      >
        GitHub
      </Anchor>
      {" ・ "}
      <Anchor component={Link} to="/terms" size="xs">
        利用規約
      </Anchor>
      {" ・ "}
      <Anchor component={Link} to="/privacy" size="xs">
        プライバシーポリシー
      </Anchor>
    </Text>
  );
}
