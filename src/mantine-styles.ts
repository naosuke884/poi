// Mantine の CSS は、使っているコンポーネントの分だけ読み込む (丸ごとの styles.css は 232 kB あり、
// 描画をブロックする。issue #135)。順番は styles.css と同じにする (依存される側が先)。
// @mantine/core のコンポーネントを使い始めたら、ここにも足す。足し忘れは mantine-styles.test.ts が
// 落ちて、貼り付ける import の一覧を出す
import "@mantine/core/styles/baseline.css";
import "@mantine/core/styles/default-css-variables.css";
import "@mantine/core/styles/global.css";
import "@mantine/core/styles/ScrollArea.css";
import "@mantine/core/styles/UnstyledButton.css";
import "@mantine/core/styles/VisuallyHidden.css";
import "@mantine/core/styles/Paper.css";
import "@mantine/core/styles/Overlay.css";
import "@mantine/core/styles/Popover.css";
import "@mantine/core/styles/Loader.css";
import "@mantine/core/styles/ActionIcon.css";
import "@mantine/core/styles/CloseButton.css";
import "@mantine/core/styles/Group.css";
import "@mantine/core/styles/ModalBase.css";
import "@mantine/core/styles/Input.css";
import "@mantine/core/styles/FloatingIndicator.css";
import "@mantine/core/styles/Affix.css";
import "@mantine/core/styles/Alert.css";
import "@mantine/core/styles/Text.css";
import "@mantine/core/styles/Anchor.css";
import "@mantine/core/styles/AppShell.css";
import "@mantine/core/styles/InlineInput.css";
import "@mantine/core/styles/Avatar.css";
import "@mantine/core/styles/Button.css";
import "@mantine/core/styles/Center.css";
import "@mantine/core/styles/Container.css";
import "@mantine/core/styles/Divider.css";
import "@mantine/core/styles/List.css";
import "@mantine/core/styles/Menu.css";
import "@mantine/core/styles/Modal.css";
import "@mantine/core/styles/Notification.css";
import "@mantine/core/styles/RadioCard.css";
import "@mantine/core/styles/RadioIndicator.css";
import "@mantine/core/styles/Radio.css";
import "@mantine/core/styles/Tooltip.css";
import "@mantine/core/styles/SegmentedControl.css";
import "@mantine/core/styles/Skeleton.css";
import "@mantine/core/styles/Stack.css";
import "@mantine/core/styles/ThemeIcon.css";
import "@mantine/core/styles/Title.css";
import "@mantine/core/styles/Typography.css";
