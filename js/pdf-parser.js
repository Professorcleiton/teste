// ============================================================
//  PDF.js — configuração do worker
// ============================================================
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ============================================================
//  DISCIPLINAS
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
//  NORMALIZAÇÃO DE DISCIPLINAS
// ============================================================
function normalizarDisciplina(texto) {
    const t = texto.toUpperCase().replace(/\s+/g, ' ').trim();

    if (/^ARTE/.test(t)) return 'ARTE';
    if (/^CIENCIAS/.test(t)) return 'CIENCIAS';
    if (/^ED\s*DIG/.test(t)) return 'EDDIG';
    if (/^EDUCACAO\s*FIS/.test(t)) return 'EDFIS';
    if (/^ENSINO\s*RELIG/.test(t)) return 'ENSREL';
    if (/^GEOGRAFIA/.test(t)) return 'GEOGRAFIA';
    if (/^HISTORIA/.test(t)) return 'HISTORIA';
    if (/^LINGUA\s*INGLE/.test(t) || /^INGLES/.test(t)) return 'INGLES';
    if (/^LINGUA\s*PORTU/.test(t) || /^PORTUGUES/.test(t)) return 'PORTUGUES';

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
                celulasComX: l.itens.map(it => ({ x: it.x, y: it.y, texto: it.texto })),
                textoLinha: l.itens.map(it => it.texto).join(' | ')
            });
        });
    }

    return todasLinhas;
}

// ============================================================
//  DETECTA TODAS AS TABELAS DO PDF
// ============================================================
function detectarTabelas(linhas) {
    const tabelas = [];

    const cabecalhos = [];
    for (const linha of linhas) {
        const disciplinas = [];
        linha.celulasComX.forEach(c => {
            const disc = normalizarDisciplina(c.texto);
            if (disc) {
                disciplinas.push({ x: c.x, disciplina: disc, texto: c.texto });
            }
        });
        if (disciplinas.length >= 3) {
            cabecalhos.push({ linha, disciplinas });
        }
    }

    console.log(`🔍 ${cabecalhos.length} cabeçalhos potenciais`);

    for (let idx = 0; idx < cabecalhos.length; idx++) {
        const cab = cabecalhos[idx];
        const linhaCab = cab.linha;

        let melhorLinhaT = null;
        let menorDist = Infinity;

        for (const l of linhas) {
            if (l.pagina !== linhaCab.pagina) continue;
            if (l.y >= linhaCab.y - 1) continue;

            const celulasT = l.celulasComX.filter(c => /^T[123]$/.test(c.texto));
            if (celulasT.length < cab.disciplinas.length * 2) continue;

            const dist = linhaCab.y - l.y;
            if (dist < 40 && dist < menorDist) {
                menorDist = dist;
                melhorLinhaT = l;
            }
        }

        if (!melhorLinhaT) continue;

        const celulasT = melhorLinhaT.celulasComX.filter(c => /^T[123]$/.test(c.texto));
        const colunas = [];

        celulasT.forEach(cT => {
            let melhorDisc = null;
            let menorDistX = 50;

            for (const d of cab.disciplinas) {
                const dist = Math.abs(d.x - cT.x);
                if (dist < menorDistX) {
                    menorDistX = dist;
                    melhorDisc = d;
                }
            }

            if (melhorDisc) {
                colunas.push({
                    x: cT.x,
                    disciplina: melhorDisc.disciplina,
                    trimestre: parseInt(cT.texto[1])
                });
            }
        });

        for (let i = 0; i < colunas.length; i++) {
            const atual = colunas[i];
            const anterior = colunas[i - 1];
            const proxima = colunas[i + 1];
            atual.xMin = anterior ? (anterior.x + atual.x) / 2 : atual.x - 12;
            atual.xMax = proxima ? (atual.x + proxima.x) / 2 : atual.x + 12;
        }

        let yBase = 20;

        const proximoCab = cabecalhos
            .filter(c =>
                c.linha.pagina === linhaCab.pagina &&
                c.linha.y < linhaCab.y - 5
            )
            .sort((a, b) => b.linha.y - a.linha.y)[0];

        if (proximoCab) {
            yBase = proximoCab.linha.y + 15;
        }

        tabelas.push({
            pagina: linhaCab.pagina,
            yTopo: melhorLinhaT.y,
            yBase: yBase,
            colunas,
            disciplinas: cab.disciplinas.map(d => d.disciplina)
        });

        console.log(`📋 Tabela ${idx}: P${linhaCab.pagina} Y[${yBase.toFixed(0)}..${melhorLinhaT.y.toFixed(0)}] ${cab.disciplinas.length} disc, ${colunas.length} cols`);
    }

    return tabelas;
}

// ============================================================
//  ENCONTRA A COLUNA PARA UMA NOTA (considerando página+Y+X)
// ============================================================
function encontrarColuna(tabelas, nota) {
    const candidatas = tabelas.filter(t =>
        t.pagina === nota.pagina &&
        nota.y >= t.yBase &&
        nota.y <= t.yTopo
    );

    if (candidatas.length === 0) return null;

    let tabela = candidatas[0];
    if (candidatas.length > 1) {
        tabela = candidatas.reduce((melhor, t) => {
            const distMelhor = Math.abs(nota.y - melhor.yTopo);
            const distAtual = Math.abs(nota.y - t.yTopo);
            return distAtual < distMelhor ? t : melhor;
        });
    }

    for (const col of tabela.colunas) {
        if (nota.x >= col.xMin && nota.x < col.xMax) {
            return col;
        }
    }

    return null;
}

// ============================================================
//  DETECÇÃO DE ALUNOS — versão final
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

    const tabelas = detectarTabelas(linhas);
    console.log(`\n📚 TOTAL: ${tabelas.length} tabelas detectadas\n`);

    if (tabelas.length === 0) return [];

    // Filtra linhas relevantes — SEM break!
    const linhasRelevantes = [];
    for (const linha of linhas) {
        const txt = linha.textoLinha;
        if (/GOVERNO|SECRETARIA|CRUZEIRO|ANCHIETA|Curso:|RELATÓRIO|Sistema Escola|DATA:/i.test(txt)) continue;
        if (/^T[123]\s*\|/.test(txt)) continue;
        if (/^ARTE\s*\|.*CIENCIAS/i.test(txt)) continue;
        if (/^MATEMATICA\s*\|.*CIDADANIA/i.test(txt)) continue;
        if (/Total de registros abaixo/i.test(txt)) continue;
        if (/^Nro\./.test(txt)) continue;
        if (/^Disciplinas/.test(txt)) continue;
        linhasRelevantes.push(linha);
    }

    console.log(`📝 ${linhasRelevantes.length} linhas relevantes`);

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

    console.log(`📦 ${blocos.length} blocos totais`);

    // Agrupa blocos por número
    const blocosPorNumero = {};
    for (const bloco of blocos) {
        if (!blocosPorNumero[bloco.numero]) {
            blocosPorNumero[bloco.numero] = [];
        }
        blocosPorNumero[bloco.numero].push(bloco);
    }

    console.log(`👥 ${Object.keys(blocosPorNumero).length} alunos únicos\n`);

    // Processa cada aluno
    for (const numeroStr of Object.keys(blocosPorNumero)) {
        const numero = parseInt(numeroStr);
        const blocosDoAluno = blocosPorNumero[numero];

        const todasAsLinhas = [];
        for (const b of blocosDoAluno) {
            todasAsLinhas.push(...b.linhas);
        }

        const primeiroBloco = blocosDoAluno[0];

        // Extrai nome
        const partesNome = [];
        for (let k = 0; k < todasAsLinhas.length; k++) {
            const linha = todasAsLinhas[k];
            const textos = linha.celulasComX.map(c => c.texto);
            const inicioIdx = (k === 0) ? (primeiroBloco.idxNum + 1) : 0;

            for (let j = inicioIdx; j < textos.length; j++) {
                const c = textos[j].trim();
                if (!c) continue;
                if (/^[A-ZÀ-Ú][A-ZÀ-Ú\s\.]{2,}$/.test(c) && !/^\d/.test(c)) {
                    if (normalizarDisciplina(c)) continue;
                    if (/^(DISCIPLINAS|RELATÓRIO)/.test(c)) continue;
                    partesNome.push(c);
                }
                if (/^\d{1,2}[.,]\d$/.test(c) || c === '--') break;
            }
        }

        const nomeCompleto = partesNome.join(' ').replace(/\s+/g, ' ').trim();
        if (!nomeCompleto || nomeCompleto.length < 5) continue;

        // Mapeia notas
        const notasPorChave = {};

        for (let k = 0; k < todasAsLinhas.length; k++) {
            const linha = todasAsLinhas[k];
            const inicioIdx = (k === 0) ? (primeiroBloco.idxNum + 1) : 0;

            for (let j = inicioIdx; j < linha.celulasComX.length; j++) {
                const c = linha.celulasComX[j];
                if (!/^\d{1,2}[.,]\d$/.test(c.texto)) continue;

                const valor = parseFloat(c.texto.replace(',', '.'));
                if (isNaN(valor) || valor < 0 || valor > 10) continue;

                const col = encontrarColuna(tabelas, {
                    pagina: linha.pagina,
                    y: linha.y,
                    x: c.x
                });

                if (col) {
                    const chave = `${col.disciplina}_T${col.trimestre}`;
                    if (notasPorChave[chave] === undefined) {
                        notasPorChave[chave] = valor;
                    }
                }
            }
        }

        // Notas do trimestre
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

        // Regra conservadora
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
                ? `Faltam notas em ${disciplinasComAlgumaNota.length - notasT.length} disciplina(s)`
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
