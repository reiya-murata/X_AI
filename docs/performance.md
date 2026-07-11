# Performance Baseline

通常候補取得は`createdAt desc`で最大120件、Functions集計は最大500件に制限されており、無制限全件取得ではない。operationLogsは通常画面で取得せず、品質Labはlocalhost/demo Emulator限定である。

本番前に500候補、複数draft、5,000 operationLogsをEmulatorへ投入し、初期表示、read件数、payload、filter/sort時間、メモリを計測する。現時点では日次3〜10件の初期運用規模に対してpagination UI追加は過剰と判断し、120件上限を維持する。120件超の運用が常態化した時点でcursor paginationを導入する。
