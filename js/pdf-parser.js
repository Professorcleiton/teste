// ============================================================
//  PDF.js — configuração do worker
// ============================================================
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ============================================================
//  EXTRAÇÃO POR COORDENADAS (Y)
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
                texto: item.str.trim(),
                largura: item.width || 0
            }))
            .filter(it => it.texto.length > 0);

        // Agrupa por Y (linha) — tolerância 3px
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

        // Ordena itens por X em cada linha
        linhasAgrupadas.sort((a, b) => b.y - a.y);
        linhasAgrupadas.forEach(l => {
            l.itens.sort((a, b) => a.x - b.x);
            todasLinhas.push({
                pagina: l.pagina,
                y: l.y,
                celulas: l.itens.map(it => it.texto),
                // ⚠️ NOVO: guarda também a coordenada X de cada célula
                celulasComX: l.itens.map(it => ({ x: it.x, texto: it.texto })),
                textoLinha: l.itens.map(it => it.texto).join(' | ')
            });
        });
    }

    return todasLinhas;
}
// ============================================================
//  DETECÇÃO DE ALUNOS — V7 (definitiva)
//  Reconhece: "N | SOBRENOME | notas..." ou "N | nome | notas..."
// ============================================================
function extrairAlunosDasLinhas(linhas, trimestre) {
    const alunos = [];
    let turma = { serie: '', letra: '' };

    // ---- Detecta turma ----
    for (const linha of linhas) {
        const m = linha.textoLinha.match(/Seriação:\s*(\d+)[ªº°]?\s*Ano.*Turma:\s*([A-Z])/i);
        if (m) {
            turma = { serie: m[1] + 'º ANO', letra: m[2].toUpperCase() };
            break;
        }
    }

    // ---- Detecta as coordenadas X do cabeçalho T1 T2 T3 ----
    // Encontra a linha do cabeçalho "T1 T2 T3 T1 T2 T3 ..." (a que tem mais T's)
    let cabecalhoX = null;
    for (const linha of linhas) {
        const tCount = (linha.textoLinha.match(/T[123]/g) || []).length;
        if (tCount >= 20) {  // deve ter ~27 T's
            cabecalhoX = linha.celulasComX;
            break;
        }
    }

    if (!cabecalhoX) {
        console.error('❌ Cabeçalho T1/T2/T3 não encontrado!');
        return [];
    }

    // Mapeia: cada célula do cabeçalho tem {x, texto: 'T1'|'T2'|'T3'}
    // Filtra só os que são T1, T2 ou T3
    const colunas = cabecalhoX
        .filter(c => /^T[123]$/.test(c.texto))
        .map(c => ({ x: c.x, trimestre: parseInt(c.texto[1]) }));

    console.log(`📐 Colunas detectadas: ${colunas.length} colunas (T1/T2/T3)`);

    // Filtra linhas relevantes
    const linhasRelevantes = [];
    for (const linha of linhas) {
        const txt = linha.textoLinha;
        if (/GOVERNO|SECRETARIA|CRUZEIRO|ANCHIETA|Curso:|RELATÓRIO|Sistema Escola|DATA:/i.test(txt)) continue;
        if (/Total de registros abaixo/i.test(txt)) break;
        linhasRelevantes.push(linha);
    }

    let nomeBuffer = [];

    for (let i = 0; i < linhasRelevantes.length; i++) {
        const linha = linhasRelevantes[i];
        const celulas = linha.celulas;

        // Detecta linha de nome puro
        const textoLimpo = celulas.join(' ').trim();
        const temNumero = celulas.some(c => /^\d{1,2}$/.test(c));
        const ehSóNome = !temNumero &&
                        /^[A-ZÀ-Ú][A-ZÀ-Ú\s\.]{3,}$/.test(textoLimpo) &&
                        textoLimpo.length >= 8 &&
                        !/ARTE|CIENCIAS|DISCIPLINAS/i.test(textoLimpo);

        if (ehSóNome) {
            nomeBuffer.push(textoLimpo);
            if (nomeBuffer.length > 3) nomeBuffer.shift();
            continue;
        }

        // Detecta número
        let idxNum = -1;
        for (let j = 0; j < Math.min(celulas.length, 2); j++) {
            if (/^\d{1,2}$/.test(celulas[j])) {
                const n = parseInt(celulas[j]);
                if (n >= 1 && n <= 99) { idxNum = j; break; }
            }
        }
        if (idxNum === -1) { nomeBuffer = []; continue; }

        const numero = parseInt(celulas[idxNum]);
        if (alunos.find(a => a.numero === numero)) { nomeBuffer = []; continue; }

        // Extrai nome inline
        let nomeInline = '';
        for (let j = idxNum + 1; j < celulas.length; j++) {
            const c = celulas[j];
            if (/^[A-ZÀ-Ú][A-ZÀ-Ú\s\.]{2,}$/.test(c) && !/^\d/.test(c)) {
                nomeInline = c;
                break;
            }
            if (/^\d{1,2}[.,]\d$/.test(c) || c === '--') break;
        }

        // Monta nome
        const partes = [...nomeBuffer];
        if (nomeInline) partes.push(nomeInline);
        let nome = partes.join(' ').replace(/\s+/g, ' ').trim();

        if (nome.split(' ').length < 2 && i + 1 < linhasRelevantes.length) {
            const prox = linhasRelevantes[i + 1];
            const proxTxt = prox.celulas.join(' ').trim();
            if (/^[A-ZÀ-Ú][A-ZÀ-Ú\s\.]{3,}$/.test(proxTxt) &&
                !prox.celulas.some(c => /^\d{1,2}$/.test(c))) {
                nome = (nome + ' ' + proxTxt).trim();
            }
        }

        if (!nome || nome.length < 5) { nomeBuffer = []; continue; }

        // ============================================================
        // ✅ MAPEAMENTO CORRETO: para cada nota, encontra a coluna
        //    pela coordenada X mais próxima
        // ============================================================
        const notasPorTrimestre = { 1: {}, 2: {}, 3: {} };  // trimestre → {disciplina: nota}
        let disciplinaIndex = 0;

        // Pega as células com X (a partir do número)
        const celulasComX = linha.celulasComX;

        // Itera sobre cada célula de nota e acha a coluna mais próxima
        for (let j = 0; j < celulasComX.length; j++) {
            const c = celulasComX[j];
            if (!/^\d{1,2}[.,]\d$/.test(c.texto)) continue;

            // Acha a coluna T com X mais próximo (tolerância 15px)
            let colunaMaisProxima = null;
            let menorDistancia = 15;

            for (const col of colunas) {
                const dist = Math.abs(col.x - c.x);
                if (dist < menorDistancia) {
                    menorDistancia = dist;
                    colunaMaisProxima = col;
                }
            }

            if (colunaMaisProxima) {
                const tri = colunaMaisProxima.trimestre;
                const idxDisciplina = Math.floor(colunas.indexOf(colunaMaisProxima) / 3);
                notasPorTrimestre[tri][`disc${idxDisciplina}`] = 
                    parseFloat(c.texto.replace(',', '.'));
            }
        }

        // Pega só as notas do trimestre desejado
        const notasT = Object.values(notasPorTrimestre[trimestre])
            .filter(n => !isNaN(n));

        if (notasT.length < 3) { nomeBuffer = []; continue; }

        alunos.push({
            numero,
            nome,
            turma: { ...turma },
            notasTrimestre: notasT,
            media: notasT.reduce((a, b) => a + b, 0) / notasT.length,
            elegivel: notasT.every(n => n >= CONFIG.notaMinima)
        });

        nomeBuffer = [];
    }

    return alunos.sort((a, b) => a.numero - b.numero);
}

// ============================================================
//  FILTRO DE TRIMESTRE — detecção automática de padrão
// ============================================================
function filtrarNotasTrimestre(notas, trimestre) {
    // O parser remove os "--" e mantém apenas notas válidas.
    // Se o PDF tem N disciplinas × 2 trimestres, o padrão é:
    //   [D1-T1, D1-T2, D2-T1, D2-T2, D3-T1, D3-T2, ...]
    // Se tem N × 3 trimestres:
    //   [D1-T1, D1-T2, D1-T3, D2-T1, ...]
    //
    // Total de notas detectadas:
    //   16 → 8 disciplinas × 2 trimestres
    //   24 → 8 disciplinas × 3 trimestres
    //   27 → 9 disciplinas × 3 trimestres
    //   18 → 9 disciplinas × 2 trimestres
    const total = notas.length;
    let porDisciplina = 2;  // padrão para seu PDF

    if (total === 16 || total === 18 || total === 20) porDisciplina = 2;
    else if (total === 24 || total === 27) porDisciplina = 3;
    else if (total % 3 === 0) porDisciplina = 3;

    const offset = (trimestre - 1) % porDisciplina;
    const filtradas = [];
    for (let i = offset; i < notas.length; i += porDisciplina) {
        filtradas.push(notas[i]);
    }
    return filtradas;
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
