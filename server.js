const fastify = require('fastify')({ logger: true });
require('dotenv').config();
const fs = require('fs');
const { PythonShell } = require('python-shell');
const fetch = require('node-fetch');

// Configuração Hikvision - Mantemos o multipart
fastify.register(require('@fastify/multipart'), {
  attachFieldsToBody: 'keyValues',
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Rota principal
fastify.post('/webhook', async (request, reply) => {
  try {
    // Log completo para diagnóstico
    fastify.log.info("🔔 Dados brutos recebidos:", request.body);

    // Processamento robusto dos dados
    const rawEventLog = request.body.event_log;
    let eventLog;
    
    try {
      eventLog = typeof rawEventLog === 'string' ? JSON.parse(rawEventLog) : rawEventLog;
    } catch (e) {
      throw new Error(`Falha ao parsear event_log: ${e.message}`);
    }

    // Validação do formato Hikvision
    if (!eventLog || !eventLog.AccessControllerEvent) {
      throw new Error("Formato de dados inválido da câmera. Estrutura AccessControllerEvent ausente.");
    }

    // Extração dos campos no formato real da câmera
    const responseData = {
      nome: "Desconhecido",
      dispositivo: eventLog.AccessControllerEvent?.deviceName || "subdoorOne",
      ip: eventLog.ipAddress || "Não informado",
      macAddress: eventLog.macAddress || "N/A",
      timestamp: eventLog.dateTime || new Date().toISOString(),
      eventType: mapEventType(eventLog.AccessControllerEvent?.majorEventType),
      subEventType: eventLog.AccessControllerEvent?.subEventType,
      verifyMode: eventLog.AccessControllerEvent?.currentVerifyMode,
      serialNumber: eventLog.AccessControllerEvent?.serialNo?.toString() || "N/A",
      employeeId: eventLog.AccessControllerEvent?.employeeNoString || "N/A",
      rawData: eventLog
    };

    // =============================================
    // IMPLEMENTAÇÃO DO RECONHECIMENTO FACIAL
    // =============================================
    try {
      // 1. Obter imagem da câmera
      const cameraIP = eventLog.ipAddress || '192.168.3.68'; // IP padrão se não informado
      const snapshotUrl = `http://${cameraIP}/ISAPI/Streaming/channels/101/picture`;
      
      // 2. Fazer download da imagem (substitua pelas suas credenciais)
      const response = await fetch(snapshotUrl, {
        headers: { 
          Authorization: 'Basic ' + Buffer.from(`${process.env.CAMERA_USER}:${process.env.CAMERA_PASS}`).toString('base64')
        }
      });
      
      if (!response.ok) throw new Error(`Falha ao obter imagem: ${response.statusText}`);
      
      const imageBuffer = await response.buffer();
      
      // 3. Salvar temporariamente
      const tempImagePath = `./temp_${Date.now()}.jpg`;
      fs.writeFileSync(tempImagePath, imageBuffer);
      
      // 4. Processar reconhecimento facial
      const result = await PythonShell.run('face_recognition.py', {
        args: [tempImagePath],
        pythonOptions: ['-u'],
        scriptPath: __dirname
      });
      
      // 5. Atualizar nome se reconhecido
      if (result && result[0] && result[0] !== 'Desconhecido') {
        responseData.nome = result[0];
        fastify.log.info(`👤 Pessoa reconhecida: ${result[0]}`);
      }
      
      // 6. Limpar arquivo temporário
      fs.unlinkSync(tempImagePath);
      
    } catch (faceError) {
      fastify.log.error("⚠ Erro no reconhecimento facial:", faceError.message);
      // Não falha o processo todo se o facial der erro
    }

    fastify.log.info("✅ Dados processados:", responseData);
    return { 
      success: true,
      data: responseData
    };

  } catch (error) {
    fastify.log.error("❌ Erro no processamento:", {
      error: error.message,
      stack: error.stack,
      receivedData: request.body
    });
    
    return reply.code(400).send({
      success: false,
      error: "Erro no processamento",
      details: error.message
    });
  }
});

// Mapeamento de tipos de evento (mantido)
function mapEventType(majorEventType) {
  const types = {
    1: "Alarme",
    2: "Controle de Acesso",
    3: "Evento de Rede",
  };
  return types[majorEventType] || `Desconhecido (${majorEventType})`;
}

// Health Check (mantido)
fastify.get('/', () => ({
  status: 'online',
  message: 'Servidor Hikvision - Webhook',
  endpoints: {
    webhook: {
      method: 'POST',
      path: '/webhook',
      contentType: 'multipart/form-data'
    }
  }
}));

// Inicia servidor
const start = async () => {
  try {
    await fastify.listen({ 
      port: process.env.PORT || 3000, 
      host: '0.0.0.0' 
    });
    console.log(`🚀 Servidor pronto em http://0.0.0.0:${fastify.server.address().port}`);
  } catch (err) {
    console.error("❌ Falha crítica ao iniciar servidor:", err);
    process.exit(1);
  }
};

start();