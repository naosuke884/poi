// 別のルートのディレクトリの -components / -lib を import させない (route-colocation skill)。
// 使えるのは自分か祖先のルートのものだけで、複数のルートで使うなら src/components / src/lib へ移す。
// パスの書き方で判定する (import 先の解決はしない):
// - ../ だけをさかのぼった先の -components / -lib (祖先のルートのもの) は OK。
//   さかのぼった後に別のディレクトリ (board/ や (root)/ など) へ入ってから届くものは NG
// - ./ から子のディレクトリへ入って届くものは NG (__root.tsx から ./(root)/ は OK)
import { definePlugin, defineRule } from "vite-plus/lint/plugins";

const PARENT_ROUTE_SOURCE = /^(?:\.\.\/)+.*\/-(?:components|lib)(?:\/.*)?$/;
const ANCESTOR_ROUTE_SOURCE = /^(?:\.\.\/)+-(?:components|lib)(?:\/.*)?$/;
const CHILD_ROUTE_SOURCE = /^\.\/.*\/-(?:components|lib)(?:\/.*)?$/;
const OWN_ROUTE_SOURCE = /^\.\/(?:\(root\)\/)?-(?:components|lib)(?:\/.*)?$/;

export function isCrossRouteSource(source: string): boolean {
  return (
    (PARENT_ROUTE_SOURCE.test(source) && !ANCESTOR_ROUTE_SOURCE.test(source)) ||
    (CHILD_ROUTE_SOURCE.test(source) && !OWN_ROUTE_SOURCE.test(source))
  );
}

type SourceNode = { type: string; value?: unknown } | null | undefined;

const noCrossRouteImport = defineRule({
  meta: {
    messages: {
      crossRoute:
        "別のルートのディレクトリの -components / -lib を import しない (自分か祖先のルートのものだけ使える)。複数のルートで使うなら src/components / src/lib へ移す (route-colocation skill)",
    },
  },
  create(context) {
    const check = (source: SourceNode) => {
      if (source?.type !== "Literal" || typeof source.value !== "string") return;
      if (isCrossRouteSource(source.value)) {
        context.report({ node: source as never, messageId: "crossRoute" });
      }
    };
    // import ... from / export ... from / import("...") (vi.mock のパスは対象外)
    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source as SourceNode),
    };
  },
});

export default definePlugin({
  meta: { name: "poi" },
  rules: { "no-cross-route-import": noCrossRouteImport },
});
