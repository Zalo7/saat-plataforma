// Texto del convenio de honorarios y autorización de representación.
// Se usa en el navegador (vista previa antes de firmar) y en el servidor (PDF firmado).
// IMPORTANTE: borrador a revisar por el Dr. Stancheff antes de publicar.
(function (root) {
  function fmtFecha(iso) {
    if (!iso) return '__/__/____';
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  function convenioTexto(c, cfg) {
    const cliente = `${c.nombre || ''} ${c.apellido || ''}`.trim() || '________________';
    const pct = String(cfg.pct_cuota_litis || '20').replace('.', ',');
    const aseg = c.aseguradora_nombre || c.aseguradora_texto || 'la aseguradora del vehículo responsable';
    return {
      titulo: 'CONVENIO DE HONORARIOS Y AUTORIZACIÓN DE REPRESENTACIÓN PARA RECLAMO EXTRAJUDICIAL',
      partes: `Entre ${cliente}, DNI ${c.dni || '__________'}, con domicilio en ${c.domicilio || '__________'}, ${c.localidad || ''}${c.provincia ? ', ' + c.provincia : ''}, teléfono ${c.telefono || '________'} y correo electrónico ${c.email || '________'} (en adelante, "EL CLIENTE"), por una parte; y ${cfg.abogado_nombre}, ${cfg.abogado_matricula}, con domicilio profesional en ${cfg.domicilio}, quien actúa bajo la marca registrada SAAT — Servicio de Asistencia en Accidentes de Tránsito (en adelante, "EL ABOGADO"), por la otra; se celebra el presente convenio, sujeto a las siguientes cláusulas:`,
      clausulas: [
        ['PRIMERA — Objeto', `EL CLIENTE encomienda a EL ABOGADO la gestión del reclamo extrajudicial por los daños y perjuicios sufridos con motivo del accidente de tránsito ocurrido el ${fmtFecha(c.fecha_accidente)} en ${c.lugar || '__________'}, ${c.localidad_acc || ''}, contra el responsable del hecho y/o ${aseg}, y la autoriza a representarlo, presentar el reclamo, acompañar documentación, solicitar información, negociar y proponer acuerdos ante dicha compañía. Todo acuerdo final requerirá la conformidad expresa de EL CLIENTE.`],
        ['SEGUNDA — Alcance', 'La gestión es exclusivamente extrajudicial. Si no se obtuviera un acuerdo satisfactorio, EL ABOGADO informará a EL CLIENTE, quien podrá decidir libremente si inicia acciones judiciales, lo que será objeto de un convenio separado.'],
        ['TERCERA — Sin costo anticipado', 'EL CLIENTE no abona suma alguna por adelantado, ni gastos de gestión, ni honorarios mientras el reclamo esté en trámite.'],
        ['CUARTA — Honorarios', `Los honorarios de EL ABOGADO se integran por: (a) los honorarios que se convengan a cargo de la compañía aseguradora en el acuerdo; y (b) un pacto de cuota litis equivalente al ${pct}% (${pct} por ciento) de las sumas que EL CLIENTE efectivamente perciba en concepto de indemnización, exigible únicamente al momento del cobro. Si el reclamo no prospera y EL CLIENTE no percibe suma alguna, no deberá honorarios. Todo ello dentro de los límites establecidos por la normativa arancelaria vigente en la Provincia del Chaco.`],
        ['QUINTA — Percepción y liquidación', 'Al momento del pago, EL ABOGADO entregará a EL CLIENTE una liquidación detallada con el monto acordado, los honorarios a cargo de la aseguradora y la cuota litis aquí pactada.'],
        ['SEXTA — Obligaciones de EL CLIENTE', 'EL CLIENTE declara que los datos y documentos aportados son verdaderos; se compromete a aportar la documentación que se le requiera, a no negociar ni celebrar acuerdos directamente con la aseguradora o el responsable, y a no otorgar otro mandato por el mismo hecho mientras se encuentre vigente el presente. Si EL CLIENTE revocara este convenio sin causa o arribara a un acuerdo directo, deberá a EL ABOGADO los honorarios correspondientes a las tareas realizadas, conforme la normativa arancelaria vigente.'],
        ['SÉPTIMA — Datos personales', 'EL CLIENTE presta consentimiento libre, expreso e informado para que sus datos personales, incluidos los datos de salud vinculados al accidente, sean tratados por EL ABOGADO con la exclusiva finalidad de gestionar el reclamo y comunicados a la aseguradora interviniente a ese fin (Ley 25.326). Puede ejercer sus derechos de acceso, rectificación y supresión escribiendo al correo de contacto del estudio.'],
        ['OCTAVA — Comunicaciones', 'Las partes aceptan como válidos para todas las comunicaciones el correo electrónico, el teléfono / WhatsApp denunciados y la plataforma de seguimiento de SAAT.'],
        ['NOVENA — Firma electrónica', 'EL CLIENTE acepta suscribir el presente mediante firma electrónica en la plataforma SAAT (Ley 25.506), que registra fecha, hora, dirección IP y huella digital del documento, y se compromete a ratificarlo en forma ológrafa o a firmar la documentación complementaria que la aseguradora requiera.'],
        ['DÉCIMA — Jurisdicción', `Para cualquier controversia las partes se someten a los ${cfg.jurisdiccion || 'Tribunales Ordinarios de la ciudad de Resistencia, Provincia del Chaco'}.`],
      ],
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { convenioTexto, fmtFecha };
  else root.convenioTexto = convenioTexto;
})(this);
