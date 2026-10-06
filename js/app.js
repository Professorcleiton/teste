// ============================================================
//  Estado global
// ============================================================
let alunosProcessados = [];

// ============================================================
//  Upload de arquivos
// ============================================================
const inputPDF = document.getElementById('pdf-input');
const fileList = document.getElementById('file-list');

inputPDF.addEventListener('change', () => {
    fileList.innerHTML = '';
    for (const arquivo of inputPDF.files) {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.textContent = `📄 ${arquivo.name}`;
        fileList.appendChild(div);
    }
});

// ============================================================
//  Processar PDF
// ============================================================
document.getElementById('process-btn').addEventListener('click', async () => {
    const arquivos = inputPDF.files;
    const trimestre = parseInt(document.getElementById('trimestre').value);
    const status = document.getElementById('status');

    if (arquivos.length === 0) {
        status.innerHTML = '<span class="erro">⚠️ Selecione pelo menos um PDF.</span>';
        return;
    }

    status.innerHTML = '<span class="processando">⏳ Processando...</span>';
    alunosProcessados = [];

    try {
        for (const arquivo of arquivos) {
            const alunos = await converterTextoEmAlunos(arquivo, trimestre);
            alunosProcessados.push(...alunos);
        }

        if (alunosProcessados.length === 0) {
            status.innerHTML = '<span class="erro">❌ Nenhum aluno detectado. Verifique o PDF.</span>';
            return;
        }

        const elegiveis = alunosProcessados.filter(a => a.elegivel);
        status.innerHTML = `<span class="ok">✅ ${alunosProcessados.length} alunos processados, ${elegiveis.length} elegíveis.</span>`;

        mostrarResultados(trimestre);
    } catch (erro) {
        console.error(erro);
        status.innerHTML = `<span class="erro">❌ Erro: ${erro.message}</span>`;
    }
});

// ============================================================
//  Mostra tabela de resultados
// ============================================================
function mostrarResultados(trimestre) {
    const section = document.getElementById('result-section');
    section.style.display = 'block';

    const summary = document.getElementById('summary');
    const elegiveis = alunosProcessados.filter(a => a.elegivel);

    summary.innerHTML = `
        <div class="stats">
            <div class="stat">
                <span class="valor">${alunosProcessados.length}</span>
                <span class="label">Total</span>
            </div>
            <div class="stat destaque">
                <span class="valor">${elegiveis.length}</span>
                <span class="label">Elegíveis</span>
            </div>
        </div>
    `;

    const tbody = document.querySelector('#students-table tbody');
    tbody.innerHTML = '';

    alunosProcessados
        .sort((a, b) => b.media - a.media)
        .forEach(aluno => {
            const tr = document.createElement('tr');
            tr.className = aluno.elegivel ? 'linha-elegivel' : 'linha-nao-elegivel';
            tr.innerHTML = `
                <td>${aluno.elegivel ? `<input type="checkbox" class="check-aluno" data-numero="${aluno.numero}" checked>` : ''}</td>
                <td>${aluno.numero}</td>
                <td>${aluno.nome}</td>
                <td>${aluno.turma.serie} ${aluno.turma.letra}</td>
                <td>${aluno.media.toFixed(1)}</td>
                <td>
                    ${aluno.elegivel
                        ? '<span class="badge badge-ok">Elegível</span>'
                        : '<span class="badge badge-no">Abaixo de 8,0</span>'}
                </td>
            `;
            tbody.appendChild(tr);
        });

    // Marca/desmarca todos
    document.getElementById('check-all').onchange = (e) => {
        document.querySelectorAll('.check-aluno').forEach(c => c.checked = e.target.checked);
    };
}

// ============================================================
//  Botão: Gerar ZIP
// ============================================================
document.getElementById('generate-btn').addEventListener('click', async () => {
    const trimestre = parseInt(document.getElementById('trimestre').value);
    const selecionados = [...document.querySelectorAll('.check-aluno:checked')]
        .map(c => alunosProcessados.find(a => a.numero === parseInt(c.dataset.numero)))
        .filter(Boolean);

    if (selecionados.length === 0) {
        alert('Selecione pelo menos um aluno.');
        return;
    }

    const btn = document.getElementById('generate-btn');
    btn.disabled = true;

    try {
        await gerarTodosCertificados(selecionados, trimestre, (atual, total) => {
            btn.textContent = `⏳ Gerando ${atual}/${total}...`;
        });
        btn.textContent = '✅ Concluído!';
        setTimeout(() => {
            btn.textContent = '📄 Gerar Certificados em ZIP';
            btn.disabled = false;
        }, 2000);
    } catch (erro) {
        console.error(erro);
        alert('Erro ao gerar: ' + erro.message);
        btn.disabled = false;
        btn.textContent = '📄 Gerar Certificados em ZIP';
    }
});

// ============================================================
//  Botão: Pré-visualizar 1 certificado
// ============================================================
document.getElementById('preview-btn').addEventListener('click', async () => {
    const trimestre = parseInt(document.getElementById('trimestre').value);
    const primeiro = alunosProcessados.find(a => a.elegivel);
    if (!primeiro) {
        alert('Nenhum aluno elegível para pré-visualizar.');
        return;
    }
    const doc = await gerarCertificadoPDF(primeiro, trimestre);
    doc.output('dataurlnewwindow');
});
