#!/bin/bash

MCP_SERVER="node /workspace/dist/index.js"

send_request() {
    local method=$1
    local params=$2
    local id=$3

    cat <<EOF
{"jsonrpc":"2.0","method":"$method","params":$params,"id":$id}
EOF
}

echo "=========================================="
echo "测试 1: 列出可用客户"
echo "=========================================="
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_available","arguments":{}},"id":1}' | timeout 10 $MCP_SERVER 2>/dev/null
echo ""
echo ""

echo "=========================================="
echo "测试 2: 切换到 acme MySQL dev"
echo "=========================================="
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"switch_database","arguments":{"customer":"acme","dbType":"mysql","env":"dev"}},"id":2}' | timeout 10 $MCP_SERVER 2>/dev/null
echo ""
echo ""

echo "=========================================="
echo "测试 3: 查看当前数据库"
echo "=========================================="
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"current_database","arguments":{}},"id":3}' | timeout 10 $MCP_SERVER 2>/dev/null
echo ""
echo ""

echo "=========================================="
echo "测试 4: 获取 Schema"
echo "=========================================="
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_schema","arguments":{}},"id":4}' | timeout 10 $MCP_SERVER 2>/dev/null
echo ""
echo ""
