// ============================================================
//  PDF.js — configuração do worker
// ============================================================
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ============================================================
//  DISCIPLINAS — nomes simplificados para chave interna
//  Cada PDF tem 2 tabelas com disciplinas diferentes
// ============================================================
const DISCIPLINAS_TABELA_1 = [
    'ARTE', 'CIENCIAS', 'EDDIG', 'EDFIS', 'ENSREL',
    'GEOGRAFIA', 'HISTORIA', 'INGLES', 'PORTUGUES'
];

const DISCIPLINAS_TABELA_2 = [
    'MATEMATICA', 'CIDADANIA', 'EDFIN', 'LEITURA', 'ESPANHOL', 'RECAPREND'
];

const TODAS_DISCIPLINAS = [...DISCIPLINAS_TABELA_1, ...DISCIPLINAS_TABELA_2];

// ============================================================
//  NORMALIZAÇÃO DE NOMES DE DISCIPLINAS
//  Detecta pelo texto do cabeçalho qual é a disciplina
// ============================================================
function normalizarDisciplina(texto) {
    const t = texto.toUpperCase().replace(/\s+/g, ' ').trim();

    // Tabela 1
    if (/^ARTE/.test(t)) return 'ARTE';
    if (/^CIENCIAS/.test(t)) return 'CIENCIAS';
    if (/^ED\s*DIG/.test(t)) return 'EDDIG';
    if (/^EDUCACAO\s*FIS/.test(t)) return 'EDFIS';
    if (/^ENSINO\s*RELIG/.test(t)) return 'ENSREL';
    if (/^GEOGRAFIA/.test(t)) return 'GEOGRAFIA';
    if (/^HISTORIA/.test(t)) return 'HISTORIA';
    if (/^LINGUA\s*INGLE/.test(t) || /^INGLES/.test(t)) return 'INGLES';
    if (/^LINGUA\s*PORTU/.test(t) || /^PORTUGUES/.test(t)) return 'PORTUGUES';

    // Tabela 2
    if (/^MATEMATICA/.test(t)) return 'MATEMATICA';
    if (/^CIDADANIA/.test(t)) return 'CIDADANIA';
    if (/^EDUCACAO\s*FIN/.test(t) || /^ED\s*FIN/.test(t)) return 'EDFIN';
    if (/^LEITURA/.test(t)) return 'LEITURA';
    if (/^LINGUA\s*ESPAN/.test(t) || /^ESPANHOL/.test(t)) return 'ESPANHOL';
    if (/^REC\s*APREND/.test(t)) return 'RECAPREND';

    return null;
}

// ============================================================
//  EXTRAÇÃO POR COORDENADAS
// ============================================================
async function extrairLinhasEstruturadas(arquivo) {
    const buffer = await arquivo.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const todasLinhas = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const pagina = await pdf.getPage(i);
        const conteudo = await pagina.getTextContent();

        const itens = conteudo.items
            .map(item => ({
                x: item.transform[4],
                y: item.transform[5],
                texto: item.str.trim()
            }))
            .filter(it => it.texto.length > 0);

        const TOL_Y = 3;
        const linhasAgrupadas = [];

        itens.forEach(item => {
            let linha = linhasAgrupadas.find(l => Math.abs(l.y - item.y) < TOL_Y);
            if (linha) {
                linha.itens.push(item);
            } else {
                linhasAgrupadas.push({ y: item.y, itens: [item], pagina: i });
            }
        });

        linhasAgrupadas.sort((a, b) => b.y - a.y);
        linhasAgrupadas.forEach(l => {
            l.itens.sort((a, b) => a.x - b.x);
            todasLinhas.push({
                pagina: l.pagina,
                y: l.y,
                celulasComX: l.itens.map(it => ({ x: it.x, texto: it.texto })),
                textoLinha: l.itens.map(it => it.texto).join(' | ')
            });
        });
    }

    return todasLinhas;
}

// ============================================================
//  DETECTA AS COLUNAS DE CADA TABELA (por página + Y do cabeçalho)
//  Retorna um array de "tabelas", cada uma com seu conjunto de colunas
// ============================================================
function detectarTodasAsTabelas(linhas) {
    const tabelas = [];

    for (const linha of linhas) {
        const textos = linha.celulasComX.map(c => c.texto);

        // Procura linhas de cabeçalho de disciplinas
        // Uma linha é cabeçalho se tem pelo menos 3 disciplinas reconhecidas
        const disciplinasDetectadas = [];
        linha.celulasComX.forEach(c => {
            const disc = normalizarDisciplina(c.texto);
            if (disc) {
                disciplinasDetectadas.push({ x: c.x, disciplina: disc, texto: c.texto });
            }
        });

        if (disciplinasDetectadas.length < 3) continue;

        // Encontra a linha T1 T2 T3 IMEDIATAMENTE ABAIXO desse cabeçalho
        // (ela deve estar na mesma página e com Y menor)
        let linhaT = null;
        let menorDistanciaY = Infinity;

        for (const l of linhas) {
            if (l.pagina !== linha.pagina) continue;
            if (l.y >= linha.y) continue;  // precisa estar ABAIXO

            const celulasT = l.celulasComX.filter(c => /^T[123]$/.test(c.texto));
            if (celulasT.length < disciplinasDetectadas.length * 2) continue;

            const dist = linha.y - l.y;
            if (dist < 30 && dist < menorDistanciaY) {
                menorDistanciaY = dist;
                linhaT = l;
            }
        }

        if (!linhaT) {
            console.warn(`⚠️ Cabeçalho detectado mas sem linha T1/T2/T3 correspondente`);
            continue;
        }

        // Constrói as colunas
        const celulasT = linhaT.celulasComX.filter(c => /^T[123]$/.test(c.texto));

        // Mapeia cada coluna T para a disciplina cujo X é mais próximo
        const colunas = [];
        celulasT.forEach(cT => {
            let melhorDisc = null;
            let menorDist = 40;

            for (const d of disciplinasDetectadas) {
                const dist = Math.abs(d.x - cT.x);
                if (dist < menorDist) {
                    menorDist = dist;
                    melhorDisc = d;
                }
            }

            if (melhorDisc) {
                colunas.push({
                    x: cT.x,
                    disciplina: melhorDisc.disciplina,
                    trimestre: parseInt(cT.texto[1]),
                    xDisciplina: melhorDisc.x
                });
            }
        });

        // Cria "bins" (faixas) entre colunas
        for (let i = 0; i < colunas.length; i++) {
            const atual = colunas[i];
            const anterior = colunas[i - 1];
            const proxima = colunas[i + 1];

            atual.xMin = anterior ? (anterior.x + atual.x) / 2 : atual.x - 12;
            atual.xMax = proxima ? (atual.x + proxima.x) / 2 : atual.x + 12;
        }

        tabelas.push({
            pagina: linha.pagina,
            yCabecalho: linha.y,
            colunas,
            disciplinas: disciplinasDetectadas.map(d => d.disciplina)
        });

        console.log(`📋 Tabela detectada na página ${linha.pagina}: ${disciplinasDetectadas.length} disciplinas`);
        disciplinasDetectadas.forEach(d => console.log(`   X=${d.x.toFixed(0)} → ${d.disciplina} (${d.texto})`));
        console.log(`   ${colunas.length} colunas T1/T2/T3`);
    }

    return tabelas;
}

// ============================================================
//  ENCONTRA EM QUAL TABELA E COLUNA CAI UMA NOTA
// ============================================================
function encontrarColunaPorX(tabelas, x, y) {
    // Procura a tabela que contém essa faixa Y (na mesma página)
    // Como não sabemos a página exata, testamos todas
    for (const tabela of tabelas) {
        for (const col of tabela.colunas) {
            if (x >= col.xMin && x < col.xMax) {
                return col;
            }
        }
    }
    // Fallback: coluna mais próxima em X (tolerância larga)
    let melhor = null;
    let menorDist = 30;
    for (const tabela of tabelas) {
        for (const col of tabela.colunas) {
            const dist = Math.abs(col.x - x);
            if (dist < menorDist) {
                menorDist = dist;
                melhor = col;
            }
        }
    }
    return melhor;
}

// ============================================================
//  DETECÇÃO DE ALUNOS
// ============================================================
function extrairAlunosDasLinhas(linhas, trimestre) {
    const alunos = [];
    let turma = { serie: '', letra: '' };

    for (const linha of linhas) {
        const m = linha.textoLinha.match(/Seriação:\s*(\d+)[ªº°]?\s*Ano.*Turma:\s*([A-Z])/i);
        if (m) {
            turma = { serie: m[1] + 'º ANO', letra: m[2].toUpperCase() };
            break;
        }
    }

    // Detectar todas as tabelas
    const tabelas = detectarTodasAsTabelas(linhas);
    console.log(`\n📚 TOTAL: ${tabelas.length} tabelas detectadas\n`);

    if (tabelas.length === 0) {
        console.error('❌ Nenhuma tabela detectada');
        return [];
    }

    // Filtra linhas relevantes (remove cabeçalhos)
    const linhasRelevantes = [];
    for (const linha of linhas) {
        const txt = linha.textoLinha;
        if (/GOVERNO|SECRETARIA|CRUZEIRO|ANCHIETA|Curso:|RELATÓRIO|Sistema Escola|DATA:|^T[123]\s*\|/i.test(txt)) continue;
        if (/^ARTE\s*\|.*CIENCIAS/i.test(txt)) continue;
        if (/^MATEMATICA\s*\|.*CIDADANIA/i.test(txt)) continue;
        if (/Total de registros abaixo/i.test(txt)) break;
        linhasRelevantes.push(linha);
    }

    // Agrupa em blocos por número de aluno
    const blocos = [];
    let blocoAtual = null;

    for (let i = 0; i < linhasRelevantes.length; i++) {
        const linha = linhasRelevantes[i];
        const textos = linha.celulasComX.map(c => c.texto);

        let numeroDaLinha = null;
        let idxNum = -1;
        for (let j = 0; j < Math.min(textos.length, 2); j++) {
            if (/^\d{1,2}$/.test(textos[j])) {
                const n = parseInt(textos[j]);
                if (n >= 1 && n <= 99) {
                    const temNota = textos.some(t => /^\d{1,2}[.,]\d$/.test(t));
                    const temNomeDepois = textos.slice(j + 1).some(t => /^[A-ZÀ-Ú]/.test(t));
                    if (temNota || temNomeDepois) {
                        numeroDaLinha = n;
                        idxNum = j;
                        break;
                    }
                }
            }
        }

        if (numeroDaLinha !== null) {
            if (blocoAtual) blocos.push(blocoAtual);
            blocoAtual = { numero: numeroDaLinha, idxNum, linhas: [linha] };
        } else if (blocoAtual) {
            blocoAtual.linhas.push(linha);
        }
    }
    if (blocoAtual) blocos.push(blocoAtual);

    console.log(`📦 ${blocos.length} blocos de alunos\n`);

    // Processa cada bloco
    for (const bloco of blocos) {
        const numero = bloco.numero;
        if (alunos.find(a => a.numero === numero)) continue;

        // Extrai o nome completo (todas as partes em maiúsculas)
        const partesNome = [];
        for (let k = 0; k < bloco.linhas.length; k++) {
            const linha = bloco.linhas[k];
            const textos = linha.celulasComX.map(c => c.texto);
            const inicioIdx = (k === 0) ? bloco.idxNum + 1 : 0;

            for (let j = inicioIdx; j < textos.length; j++) {
                const c = textos[j].trim();
                if (!c) continue;
                if (/^[A-ZÀ-Ú][A-ZÀ-Ú\s\.]{2,}$/.test(c) && !/^\d/.test(c)) {
                    if (normalizarDisciplina(c)) continue;  // pula nome de disciplina
                    if (/^(DISCIPLINAS|RELATÓRIO)/.test(c)) continue;
                    partesNome.push(c);
                }
                if (/^\d{1,2}[.,]\d$/.test(c) || c === '--') break;
            }
        }

        let nomeCompleto = partesNome.join(' ').replace(/\s+/g, ' ').trim();
        if (!nomeCompleto || nomeCompleto.length < 5) continue;

        // ============================================================
        //  MAPEIA AS NOTAS DE TODAS AS TABELAS
        // ============================================================
        const notasPorChave = {};

        for (let k = 0; k < bloco.linhas.length; k++) {
            const linha = bloco.linhas[k];
            const celulas = linha.celulasComX;
            const inicioIdx = (k === 0) ? bloco.idxNum + 1 : 0;

            for (let j = inicioIdx; j < celulas.length; j++) {
                const c = celulas[j];
                if (!/^\d{1,2}[.,]\d$/.test(c.texto)) continue;

                const valor = parseFloat(c.texto.replace(',', '.'));
                if (isNaN(valor) || valor < 0 || valor > 10) continue;

                const col = encontrarColunaPorX(tabelas, c.x, c.y);
                if (col) {
                    const chave = `${col.disciplina}_T${col.trimestre}`;
                    if (notasPorChave[chave] === undefined) {
                        notasPorChave[chave] = valor;
                    }
                }
            }
        }

        // Pega notas do trimestre
        const notasT = [];
        const disciplinasPresentes = [];
        for (const disc of TODAS_DISCIPLINAS) {
            const chave = `${disc}_T${trimestre}`;
            if (notasPorChave[chave] !== undefined) {
                notasT.push(notasPorChave[chave]);
                disciplinasPresentes.push(disc);
            }
        }

        if (notasT.length === 0) {
            console.warn(`⚠️ Aluno ${numero} (${nomeCompleto}): sem notas T${trimestre}`);
            continue;
        }

        // ============================================================
        //  REGRA CONSERVADORA:
        //  - Elegível SÓ SE o aluno tem notas para TODAS as disciplinas
        //    que ele possui em QUALQUER trimestre (evita certificar
        //    por falta de dados)
        //  - E TODAS essas notas ≥ 8.0
        // ============================================================
        const disciplinasComAlgumaNota = TODAS_DISCIPLINAS.filter(disc =>
            [1, 2, 3].some(t => notasPorChave[`${disc}_T${t}`] !== undefined)
        );

        const temTodasNoTrimestre = disciplinasComAlgumaNota.every(disc =>
            notasPorChave[`${disc}_T${trimestre}`] !== undefined
        );

        const todasNotasOk = notasT.every(n => n >= CONFIG.notaMinima);
        const elegivel = temTodasNoTrimestre && todasNotasOk;

        alunos.push({
            numero,
            nome: nomeCompleto,
            turma: { ...turma },
            notasPorChave,
            notasTrimestre: notasT,
            disciplinasPresentes,
            disciplinasEsperadas: disciplinasComAlgumaNota,
            media: notasT.reduce((a, b) => a + b, 0) / notasT.length,
            elegivel,
            motivoNaoElegivel: !temTodasNoTrimestre
                ? 'Faltam notas em algumas disciplinas'
                : (!todasNotasOk ? 'Alguma nota < 8.0' : null)
        });
    }

    return alunos.sort((a, b) => a.numero - b.numero);
}

// ============================================================
//  Funções principais
// ============================================================
async function extrairTextoPDF(arquivo) {
    const linhas = await extrairLinhasEstruturadas(arquivo);
    return linhas.map(l => l.textoLinha).join('\n');
}

async function converterTextoEmAlunos(arquivo, trimestre) {
    const linhas = await extrairLinhasEstruturadas(arquivo);
    return extrairAlunosDasLinhas(linhas, trimestre);
}
