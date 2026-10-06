// ============================================================
//  PDF.js — configuração do worker
// ============================================================
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

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

        const porLinha = {};
        conteudo.items.forEach(item => {
            const x = item.transform[4];
            const y = Math.round(item.transform[5] / 5) * 5;
            if (!porLinha[y]) porLinha[y] = [];
            porLinha[y].push({ x, texto: item.str });
        });

        const ys = Object.keys(porLinha).map(Number).sort((a, b) => b - a);
        ys.forEach(y => {
            const celulas = porLinha[y].sort((a, b) => a.x - b.x);
            if (celulas.length > 0) {
                todasLinhas.push({
                    pagina: i,
                    y,
                    celulas: celulas.map(c => c.texto),
                    textoLinha: celulas.map(c => c.texto).join(' | ')
                });
            }
        });
    }
    return todasLinhas;
}

// ============================================================
//  DETECÇÃO DE ALUNOS — V4 (multi-formato)
//  Reconhece os 3 formatos que o pdf.js produz
// ============================================================
function extrairAlunosDasLinhas(linhas, trimestre) {
    const alunos = [];
    let turma = { serie: '', letra: '' };

    // ---- Detecta turma ----
    for (const linha of linhas) {
        const txt = linha.textoLinha;
        const m = txt.match(/Seriação:\s*(\d+)[ªº°]?\s*Ano.*Turma:\s*([A-Z])/i);
        if (m) {
            turma = { serie: m[1] + 'º ANO', letra: m[2].toUpperCase() };
            break;
        }
    }

    // ---- Processa linha por linha ----
    let nomeBuffer = [];  // Acumula linhas de nome quebrado

    for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];
        const celulas = linha.celulas;

        // Ignora cabeçalhos e linhas administrativas
        const textoLinha = linha.textoLinha;
        if (/GOVERNO|SECRETARIA|CRUZEIRO|ANCHIETA|Curso:|RELATÓRIO|Disciplinas|Nro\.|Nome|^T1/.test(textoLinha)) {
            continue;
        }

        // ---- FORMATO C: Tudo em 1 linha ----
        // "3 | ARIANE DE JESUS SILVA | 8.0 | 7.0 | -- | ..."
        // ou
        // "23 | LUCAS BATISTA DE OLIVEIRA | 7.0 | 5.7 | ..."
        if (celulas.length >= 5 &&
            /^\d{1,3}$/.test(celulas[0].trim()) &&
            /^[A-ZÀ-Ú][A-ZÀ-Ú\s]{4,}$/.test((celulas[1] || '').trim())) {

            const numero = parseInt(celulas[0]);
            const nome = celulas[1].trim();

            // Procura a primeira célula que é uma nota ou "--"
            const idxNotas = celulas.findIndex((c, idx) =>
                idx >= 2 && (/^\d{1,2}[.,]\d$/.test(c.trim()) || c.trim() === '--')
            );

            if (idxNotas > 0) {
                const notas = extrairNotas(celulas.slice(idxNotas));
                if (notas.length >= 5 && nome.length >= 5) {
                    alunos.push(montarAluno(numero, nome, notas, turma, trimestre));
                    nomeBuffer = [];
                    continue;
                }
            }
        }

        // ---- FORMATO A: "1 | SANTOS | 10.0 | 9.0 | -- | ..."
        // Número + sobrenome + notas, e a linha ANTERIOR tem o começo do nome
        if (celulas.length >= 4 &&
            /^\d{1,3}$/.test(celulas[0].trim())) {

            const numero = parseInt(celulas[0]);
            const segundaCelula = (celulas[1] || '').trim();

            // Se a segunda célula é texto (sobrenome), junta com o buffer
            if (/^[A-ZÀ-Ú][A-ZÀ-Ú\s]{2,}$/.test(segundaCelula) && nomeBuffer.length > 0) {
                const nome = [...nomeBuffer, segundaCelula].join(' ').replace(/\s+/g, ' ').trim();

                const idxNotas = celulas.findIndex((c, idx) =>
                    idx >= 2 && (/^\d{1,2}[.,]\d$/.test(c.trim()) || c.trim() === '--')
                );

                if (idxNotas > 0) {
                    const notas = extrairNotas(celulas.slice(idxNotas));
                    if (notas.length >= 5 && nome.length >= 5) {
                        alunos.push(montarAluno(numero, nome, notas, turma, trimestre));
                        nomeBuffer = [];
                        continue;
                    }
                }
            }

            // ---- FORMATO B: "2 | 8.5 | 6.5 | -- | ..."
            // Número + notas, SEM nome. Nome vem do buffer + linha seguinte
            if (/^(\d{1,2}[.,]\d|--)$/.test(segundaCelula) || segundaCelula === '') {

                const idxNotas = celulas.findIndex((c, idx) =>
                    idx >= 1 && (/^\d{1,2}[.,]\d$/.test(c.trim()) || c.trim() === '--')
                );

                if (idxNotas > 0) {
                    const notas = extrairNotas(celulas.slice(idxNotas));
                    if (notas.length >= 5) {
                        // Junta buffer + próxima linha (sobrenome)
                        let partesNome = [...nomeBuffer];
                        const proximaLinha = linhas[i + 1];
                        if (proximaLinha && proximaLinha.celulas.length === 1) {
                            const prox = proximaLinha.celulas[0].trim();
                            if (/^[A-ZÀ-Ú][A-ZÀ-Ú\s]{2,}$/.test(prox) &&
                                !/^\d/.test(prox)) {
                                partesNome.push(prox);
                            }
                        }

                        const nome = partesNome.join(' ').replace(/\s+/g, ' ').trim();
                        if (nome.length >= 5) {
                            alunos.push(montarAluno(numero, nome, notas, turma, trimestre));
                            nomeBuffer = [];
                            continue;
                        }
                    }
                }
            }
        }

        // ---- Acumula possíveis partes de nomes ----
        // Linha com 1 célula, texto em maiúsculas → guarda no buffer
        if (celulas.length === 1) {
            const txt = celulas[0].trim();
            if (/^[A-ZÀ-Ú][A-ZÀ-Ú\s\.]{2,}$/.test(txt) &&
                !/GOVERNO|SECRETARIA|CRUZEIRO|ANCHIETA|RELATÓRIO|Disciplinas|Nro/.test(txt)) {
                nomeBuffer.push(txt);
                if (nomeBuffer.length > 3) nomeBuffer.shift();
                continue;
            }
        }
    }

    // ---- Remove duplicatas e ordena ----
    const unicos = {};
    alunos.forEach(a => {
        if (!unicos[a.numero] || a.notas.length > unicos[a.numero].notas.length) {
            unicos[a.numero] = a;
        }
    });

    return Object.values(unicos).sort((a, b) => a.numero - b.numero);
}

// ============================================================
//  Helpers
// ============================================================
function extrairNotas(celulas) {
    const notas = [];
    for (const c of celulas) {
        const t = c.trim();
        if (t === '--' || t === '') continue;
        const m = t.match(/^\d{1,2}[.,]\d$/);
        if (m) {
            const n = parseFloat(t.replace(',', '.'));
            if (n >= 0 && n <= 10) notas.push(n);
        }
    }
    return notas;
}

function filtrarNotasTrimestre(notas, trimestre) {
    // notas: [ARTE_T1, ARTE_T2, ARTE_T3, CIENCIAS_T1, ...]
    // Só as T1 (ou T2/T3) importam
    const offset = trimestre - 1;
    const filtradas = [];
    for (let i = offset; i < notas.length; i += 3) {
        filtradas.push(notas[i]);
    }
    return filtradas;
}

function montarAluno(numero, nome, notas, turma, trimestre) {
    const notasT = filtrarNotasTrimestre(notas, trimestre);
    return {
        numero,
        nome: nome.replace(/\s+/g, ' ').trim(),
        turma: { ...turma },
        notas,                          // todas as notas
        notasTrimestre: notasT,         // só do trimestre selecionado
        media: notasT.length > 0
            ? notasT.reduce((a, b) => a + b, 0) / notasT.length
            : 0,
        elegivel: notasT.length > 0 && notasT.every(n => n >= CONFIG.notaMinima)
    };
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
