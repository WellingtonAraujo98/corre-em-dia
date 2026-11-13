#!/bin/bash
# Roda os testes de lógica do Corre em Dia com gjs (já vem no Ubuntu/GNOME).
# Uso: ./testes/rodar.sh   (a partir da pasta corre-em-dia)
set -e
cd "$(dirname "$0")"
sed -n '/<script>/,/<\/script>/p' ../index.html | sed '1d;$d' > /tmp/corre_app.js
python3 - <<'PY'
s=open('/tmp/corre_app.js').read()
hook="\nglobalThis.__T={get state(){return state},set state(v){state=v},normalize,occurrences,weekRange,atrasadas,dueIn,planIn,vezesNoMes,semanalMensal,custoMensalContas,custoVidaMensal,metaInfo,projecao,parseMoney,precisa,valorEm,ativa,bloco,daysUntil,statusMes,gcalLink,render,renderSemana,renderContas,renderReserva,mesPassadoNoPlano,semanalPagoNoMes,metasMensalAte,addMonthsYm,isoDay,esc,money};\n"
i=s.rindex("})();"); open('app_t.js','w').write(s[:i]+hook+s[i:])
PY
gjs logica.js
rm -f app_t.js
