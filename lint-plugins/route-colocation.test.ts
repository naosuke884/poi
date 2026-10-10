import { RuleTester } from "vite-plus/lint/plugins-dev";
import { describe, it } from "vite-plus/test";

import plugin from "./route-colocation.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const rule = plugin.rules["no-cross-route-import"]!;
const crossRoute = [{ messageId: "crossRoute" }];

new RuleTester().run("poi/no-cross-route-import", rule, {
  valid: [
    // 自分のルートのもの
    'import { a } from "./-components/A";',
    'import { a } from "./-lib/a";',
    // __root.tsx から (root) のもの
    'import { a } from "./(root)/-components/A";',
    // ../ だけをさかのぼった先 (祖先のルート) のもの
    'import { a } from "../-lib/a";',
    'import { a } from "../../-components/board/A";',
    // ルートの部品ではないもの
    'import { a } from "@/lib/a";',
    'import { a } from "../a";',
  ],
  invalid: [
    // さかのぼった後に別のルートのディレクトリへ入る
    { code: 'import { a } from "../board/-lib/a";', errors: crossRoute },
    { code: 'import { a } from "../../(root)/-components/A";', errors: crossRoute },
    // ./ から子のルートのディレクトリへ入る
    { code: 'import { a } from "./board/-components/A";', errors: crossRoute },
    // export ... from と import() も同じ
    { code: 'export { a } from "../board/-lib/a";', errors: crossRoute },
    { code: 'export * from "./board/-lib/a";', errors: crossRoute },
    { code: 'import("../board/-lib/a");', errors: crossRoute },
  ],
});
