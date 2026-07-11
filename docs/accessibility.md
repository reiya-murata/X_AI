# Accessibility

通常運用画面はネイティブ要素、明示label、`aria-live`、キーボードfocus表示、色以外の状態ラベルを使う。`prefers-reduced-motion`ではanimation/transitionを短縮する。

`npm run test:phase5:a11y`は主要な静的要件を検査する。リリース前はキーボードのみ、200%文字拡大、375px幅、読み上げ順、disabled/loading/error状態を手動確認する。
