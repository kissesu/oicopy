Clipboard History Management Tool


`
lsof -i :1420 | awk 'NR>1 {print $2}' | xargs kill -9 && RUST_BACKTRACE=full pnpm tauri dev
`

待完善功能:
1. 获取剪切板记录的来源
2. 在剪切板历史记录中标记记录的来源