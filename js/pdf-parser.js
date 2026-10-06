// ============================================================
//  PDF.js — configuração do worker
// ============================================================
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ============================================================
//  EXTRAÇÃO COM COORDENADAS PRECISAS
//  Cada item recebe {x, y, texto}. Depois agrupamos por Y.
// ============================================================
async function extrairLinhasEstruturadas(arquivo) {
    const buffer = await arquivo.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const todasLinhas = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const pagina = await pdf.getPage(i);
        const conteudo = await pagina.getTextContent();

        // Guarda TODOS os itens com coordenadas
        const itens = conteudo.items.map(item => ({
            x: item.transform[4],
            y: item.transform[5],
            texto: item.str.trim(),
            largura: item.width || 0
        })).filter(it => it.texto.length > 0);

        // Agrupa por linha: dois itens estão na mesma linha se
        // |y1 - y2| < TOLERANCIA
        const TOLERANCIA = 4;
        const linhasAgrupadas = [];

        itens.forEach(item => {
            // Procura linha existente próxima
            let linhaEncontrada = linhasAgrupadas.find(l =>
                Math.abs(l.y - item.y) < TOLERANCIA
            );

            if (linhaEncontrada) {
                linhaEncontrada.itens.push(item);
                linhaEncontrada.y = (linhaEncontrada.y + item.y) / 2; // média
            } else {
                linhasAgrupadas.push({
                    y: item.y,
                    pagina: i,
                    itens: [item]
                });
            }
        });

        // Ordena de cima para baixo
        linhasAgrupadas.sort((a, b) => b.y - a.y);

        linhasAgrupadas.forEach(l => {
            // Ordena itens da esquerda para direita
            l.itens.sort((a, b) => a.x - b.x);

            todasLinhas.push({
                pagina: i,
                y: l.y,
                itens: l.itens,
                celulas: l.itens.map(it => it.texto),
                textoLinha: l.itens.map(it => it.texto).join(' | ')
            });
        });
    }

    return todasLinhas;
}

// ============================================================
//  DETECÇÃO COM BUFFER POR PROXIMIDADE DE Y
// ============================================================
function extrairAlunosDasLinhas(linhas, trimestre) {
    const alunos = [];
    let turma = { serie: '', letra: '' };

    // Detecta turma
    for (const linha of linhas) {
        const txt = linha.textoLinha;
        const m = txt.match(/Seriação:\s*(\d+)[ªº°]?\s*Ano.*Turma:\s*([A-Z])/i);
        if (m) {
            turma = { serie: m[1] + 'º ANO', letra: m[2].toUpperCase() };
            break;
        }
    }

    // Filtra só linhas com conteúdo relevante (alunos + notas)
    const linhasRelevantes = linhas.filter(l => {
        const txt = l.textoLinha;
        if (/GOVERNO|SECRETARIA|CRUZEIRO|ANCHIETA|Curso:|RELATÓRIO|Disciplinas|Nro\.|Sistema Escola|DATA:/i.test(txt)) return false;
        return true;
    });

    // ---- Estratégia: procura o número do aluno e reconstrói ----
    // Um aluno é identificado por uma linha que contém o NÚMERO (1-3 dígitos)
    // seguido de notas OU nome+notas

    for (let i = 0; i < linhasRelevantes.length; i++) {
        const linha = linhasRelevantes[i];
        const celulas = linha.celulas;

        // Pula cabeçalhos de trimestre (T1 T2 T3...)
        if (celulas.every(c => /^(T[123]|--)$/.test(c.trim()))) continue;

        // ---- Detecta número de aluno ----
        // Procura célula que é APENAS um número (1-40)
        let idxNum = -1;
        for (let j = 0; j < Math.min(celulas.length, 3); j++) {
            const c = celulas[j].trim();
            if (/^\d{1,2}$/.test(c) && parseInt(c) >= 1 && parseInt(c) <= 99) {
                idxNum = j;
                break;
            }
        }

        if (idxNum === -1) continue;

        const numero = parseInt(celulas[idxNum]);

        // ---- Coleta o nome ----
        // Caso A: célula logo depois do número tem texto em maiúsculas
        let nome = '';

        for (let j = idxNum + 1; j < celulas.length; j++) {
            const c = celulas[j].trim();
            if (/^[A-ZÀ-Ú][A-ZÀ-Ú\s\.]{3,}$/.test(c)) {
                nome = c;
                break;
            }
            // Se achou uma nota, para
            if (/^\d{1,2}[.,]\d$/.test(c) || c === '--') break;
        }

        // Caso B: nome vem das linhas ANTERIORES (buffer por proximidade Y)
        if (!nome) {
            const partesNome = [];
            // Olha até 3 linhas acima
            for (let k = 1; k <= 3; k++) {
                const ant = linhasRelevantes[i - k];
                if (!ant) break;
                // Só considera se é linha SÓ com nome (1 célula texto)
                if (ant.celulas.length >= 1 && ant.celulas.length <= 3) {
                    const txtAnt = ant.celulas.join(' ').trim();
                    if (/^[A-ZÀ-Ú][A-ZÀ-Ú\s\.]{3,}$/.test(txtAnt) &&
                        !/\d/.test(txtAnt)) {
                        partesNome.unshift(txtAnt);
                    } else {
                        break;  // parou de achar nome
                    }
                } else {
                    break;
                }
            }
            nome = partesNome.join(' ');
        }

        // Caso C: nome vem da PRÓXIMA linha (sobrenome)
        if (nome && !nome.includes(' ') || (nome && nome.split(' ').length < 2)) {
            const prox = linhasRelevantes[i + 1];
            if (prox && prox.celulas.length <= 3) {
                const txtProx = prox.celulas.join(' ').trim();
                if (/^[A-ZÀ-Ú][A-ZÀ-Ú\s\.]{3,}$/.test(txtProx) &&
                    !/\d/.test(txtProx)) {
                    nome = nome + ' ' + txtProx;
                }
            }
        }

        // ---- Extrai notas ----
        const notas = [];
        for (let j = idxNum + 1; j < celulas.length; j++) {
            const c = celulas[j].trim();
            if (/^\d{1,2}[.,]\d$/.test(c)) {
                const n = parseFloat(c.replace(',', '.'));
                if (n >= 0 && n <= 10) notas.push(n);
            }
        }

        if (notas.length < 5) continue;  // precisa ter notas
        if (!nome || nome.length < 5) continue;

        // Evita duplicatas
        if (alunos.find(a => a.numero === numero)) continue;

        const notasT = filtrarNotasTrimestre(notas, trimestre);

        alunos.push({
            numero,
            nome: nome.replace(/\s+/g, ' ').trim(),
            turma: { ...turma },
            notas,
            notasTrimestre: notasT,
            media: notasT.length > 0
                ? notasT.reduce((a, b) => a + b, 0) / notasT.length
                : 0,
            elegivel: notasT.length > 0 && notasT.every(n => n >= CONFIG.notaMinima)
        });
    }

    return alunos.sort((a, b) => a.numero - b.numero);
}

// ============================================================
//  Helpers
// ============================================================
function filtrarNotasTrimestre(notas, trimestre) {
    const offset = trimestre - 1;
    const filtradas = [];
    for (let i = offset; i < notas.length; i += 3) {
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
