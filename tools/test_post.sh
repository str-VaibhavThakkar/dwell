TOKEN="36769d33"
btn="up"
gesture="single"
ts=$(date +%s%N | cut -b1-13)
body="{\"hwAction\":{\"btn\":\"$btn\",\"gesture\":\"$gesture\",\"ts\":$ts}}"
len=${#body}

req="POST /api/settings HTTP/1.1\r\nHost: 127.0.0.1:8000\r\nX-Token: $TOKEN\r\nContent-Type: application/json\r\nContent-Length: $len\r\nConnection: close\r\n\r\n$body"
printf "%b" "$req" | nc 127.0.0.1 8000
