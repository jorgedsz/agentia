import { Link } from 'react-router-dom'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'

export default function PrivacyPolicy() {
  const { darkMode, toggleDarkMode } = useTheme()
  const { language, toggleLanguage } = useLanguage()

  const lastUpdated = 'February 12, 2026'
  const lastUpdatedEs = '12 de febrero de 2026'

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-dark-bg' : 'bg-gray-50'}`}>
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-dark-card/80 backdrop-blur border-b border-gray-200 dark:border-dark-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <Link to="/login" className="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            {language === 'en' ? 'Back' : 'Volver'}
          </Link>
          <div className="flex items-center gap-2">
            <button onClick={toggleLanguage} className="px-2 py-1 rounded text-xs font-medium bg-gray-100 dark:bg-dark-hover text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-border">
              {language === 'en' ? 'ES' : 'EN'}
            </button>
            <button onClick={toggleDarkMode} className="p-1.5 rounded bg-gray-100 dark:bg-dark-hover text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-border">
              {darkMode ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-200 dark:border-dark-border p-8 sm:p-12 shadow-sm">

          {language === 'en' ? (
            <div className="prose prose-gray dark:prose-invert max-w-none">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Privacy Policy</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Last updated: {lastUpdated}</p>

              <p>Appex Innovations ("we," "us," or "our") operates the Appex Innovations platform (the "Service"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service.</p>

              <h2>1. Information We Collect</h2>

              <h3>1.1 Account Information</h3>
              <p>When you create an account, we collect:</p>
              <ul>
                <li>Name and email address</li>
                <li>Password (stored encrypted)</li>
                <li>Account role and organization affiliation</li>
              </ul>

              <h3>1.2 AI Agent and Call Data</h3>
              <p>When you use our AI voice agent services, we may collect:</p>
              <ul>
                <li>AI agent configurations and settings</li>
                <li>Call recordings, transcriptions, and metadata (duration, timestamps, outcomes)</li>
                <li>Phone numbers used for inbound and outbound calls</li>
                <li>Caller and recipient information provided during calls</li>
              </ul>

              <h3>1.3 Usage and Billing Data</h3>
              <ul>
                <li>Credit balances and transaction history</li>
                <li>Feature usage and interaction logs</li>
                <li>Model and transcriber usage per call</li>
              </ul>

              <h3>1.4 Technical Data</h3>
              <ul>
                <li>IP address, browser type, and device information</li>
                <li>Cookies and similar tracking technologies</li>
                <li>Log data and access timestamps</li>
              </ul>

              <h2>2. How We Use Your Information</h2>
              <p>We use the collected information to:</p>
              <ul>
                <li>Provide, operate, and maintain the Service</li>
                <li>Process AI voice calls and generate transcriptions</li>
                <li>Manage your account, credits, and billing</li>
                <li>Send service-related communications and updates</li>
                <li>Monitor and analyze usage to improve the Service</li>
                <li>Detect, prevent, and address security issues or fraud</li>
                <li>Comply with legal obligations</li>
              </ul>

              <h2>3. Third-Party Services</h2>
              <p>We integrate with third-party providers to deliver our services. These may include:</p>
              <ul>
                <li><strong>Voice AI providers</strong> (e.g., VAPI) for AI-powered voice calls</li>
                <li><strong>Telephony providers</strong> (e.g., Twilio) for phone call infrastructure</li>
                <li><strong>AI model providers</strong> (e.g., OpenAI, Anthropic, Google, Groq, DeepSeek, Mistral) for language model processing</li>
                <li><strong>Transcription providers</strong> (e.g., Deepgram, Assembly AI, Azure) for speech-to-text</li>
                <li><strong>Calendar providers</strong> (e.g., Google Calendar, Calendly, HubSpot, Cal.com) for appointment scheduling</li>
              </ul>
              <p>Each third-party provider has its own privacy policy governing the use of your data. We encourage you to review their respective policies.</p>

              <h2>4. Data Sharing and Disclosure</h2>
              <p>We do not sell your personal information. We may share data in the following circumstances:</p>
              <ul>
                <li><strong>With service providers:</strong> Third-party vendors who assist us in operating the Service</li>
                <li><strong>Within your organization:</strong> Agencies may view data related to their client accounts</li>
                <li><strong>For legal compliance:</strong> When required by law, regulation, or legal process</li>
                <li><strong>Business transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
                <li><strong>With your consent:</strong> When you explicitly authorize data sharing</li>
              </ul>

              <h2>5. Data Security</h2>
              <p>We implement industry-standard security measures to protect your information, including:</p>
              <ul>
                <li>AES-256-GCM encryption for sensitive data at rest</li>
                <li>TLS/HTTPS encryption for data in transit</li>
                <li>JWT-based authentication and role-based access controls</li>
                <li>Regular security audits and monitoring</li>
              </ul>
              <p>Despite these measures, no method of transmission or storage is 100% secure. We cannot guarantee absolute security of your data.</p>

              <h2>6. HIPAA Compliance</h2>
              <p>For healthcare-related use cases, our platform supports HIPAA compliance features. If you require HIPAA compliance, a Business Associate Agreement (BAA) must be executed between your organization and Appex Innovations prior to processing Protected Health Information (PHI).</p>

              <h2>7. Data Retention</h2>
              <p>We retain your information for as long as your account is active or as needed to provide the Service. Call recordings and transcriptions are retained according to your account settings and applicable legal requirements. You may request deletion of your data at any time by contacting us.</p>

              <h2>8. Your Rights</h2>
              <p>Depending on your jurisdiction, you may have the following rights:</p>
              <ul>
                <li><strong>Access:</strong> Request a copy of the personal data we hold about you</li>
                <li><strong>Correction:</strong> Request correction of inaccurate data</li>
                <li><strong>Deletion:</strong> Request deletion of your personal data</li>
                <li><strong>Portability:</strong> Request a machine-readable copy of your data</li>
                <li><strong>Objection:</strong> Object to certain processing of your data</li>
                <li><strong>Restriction:</strong> Request restriction of processing</li>
              </ul>
              <p>To exercise any of these rights, please contact us at the email address below.</p>

              <h2>9. Cookies</h2>
              <p>We use essential cookies to maintain your session and preferences (such as authentication tokens, theme, and language settings). We do not use third-party advertising or tracking cookies.</p>

              <h2>10. Children's Privacy</h2>
              <p>Our Service is not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware of any such data, we will take steps to delete it promptly.</p>

              <h2>11. International Data Transfers</h2>
              <p>Your information may be transferred to and processed in countries other than your own. We take appropriate safeguards to ensure your data is protected in accordance with this policy.</p>

              <h2>12. Changes to This Policy</h2>
              <p>We may update this Privacy Policy from time to time. We will notify you of significant changes by posting the updated policy on the Service and updating the "Last updated" date. Continued use of the Service after changes constitutes acceptance of the updated policy.</p>

              <h2>13. Contact Us</h2>
              <p>If you have questions about this Privacy Policy, please contact us at:</p>
              <p><strong>Appex Innovations</strong><br />Email: privacy@appexinnovations.com</p>
            </div>
          ) : (
            <div className="prose prose-gray dark:prose-invert max-w-none">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Politica de Privacidad</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Ultima actualizacion: {lastUpdatedEs}</p>

              <p>Appex Innovations ("nosotros," "nos" o "nuestro") opera la plataforma Appex Innovations (el "Servicio"). Esta Politica de Privacidad explica como recopilamos, usamos, divulgamos y protegemos su informacion cuando utiliza nuestro Servicio.</p>

              <h2>1. Informacion que Recopilamos</h2>

              <h3>1.1 Informacion de la Cuenta</h3>
              <p>Cuando crea una cuenta, recopilamos:</p>
              <ul>
                <li>Nombre y direccion de correo electronico</li>
                <li>Contrasena (almacenada de forma encriptada)</li>
                <li>Rol de cuenta y afiliacion organizacional</li>
              </ul>

              <h3>1.2 Datos de Agentes IA y Llamadas</h3>
              <p>Cuando utiliza nuestros servicios de agentes de voz con IA, podemos recopilar:</p>
              <ul>
                <li>Configuraciones y ajustes de agentes IA</li>
                <li>Grabaciones de llamadas, transcripciones y metadatos (duracion, marcas de tiempo, resultados)</li>
                <li>Numeros de telefono utilizados para llamadas entrantes y salientes</li>
                <li>Informacion del llamante y destinatario proporcionada durante las llamadas</li>
              </ul>

              <h3>1.3 Datos de Uso y Facturacion</h3>
              <ul>
                <li>Saldos de creditos e historial de transacciones</li>
                <li>Registros de uso de funciones e interacciones</li>
                <li>Uso de modelos y transcriptores por llamada</li>
              </ul>

              <h3>1.4 Datos Tecnicos</h3>
              <ul>
                <li>Direccion IP, tipo de navegador e informacion del dispositivo</li>
                <li>Cookies y tecnologias de seguimiento similares</li>
                <li>Datos de registro y marcas de tiempo de acceso</li>
              </ul>

              <h2>2. Como Usamos su Informacion</h2>
              <p>Utilizamos la informacion recopilada para:</p>
              <ul>
                <li>Proporcionar, operar y mantener el Servicio</li>
                <li>Procesar llamadas de voz con IA y generar transcripciones</li>
                <li>Administrar su cuenta, creditos y facturacion</li>
                <li>Enviar comunicaciones y actualizaciones relacionadas con el servicio</li>
                <li>Monitorear y analizar el uso para mejorar el Servicio</li>
                <li>Detectar, prevenir y abordar problemas de seguridad o fraude</li>
                <li>Cumplir con obligaciones legales</li>
              </ul>

              <h2>3. Servicios de Terceros</h2>
              <p>Nos integramos con proveedores externos para ofrecer nuestros servicios. Estos pueden incluir:</p>
              <ul>
                <li><strong>Proveedores de voz IA</strong> (ej., VAPI) para llamadas de voz impulsadas por IA</li>
                <li><strong>Proveedores de telefonia</strong> (ej., Twilio) para infraestructura de llamadas</li>
                <li><strong>Proveedores de modelos IA</strong> (ej., OpenAI, Anthropic, Google, Groq, DeepSeek, Mistral) para procesamiento de modelos de lenguaje</li>
                <li><strong>Proveedores de transcripcion</strong> (ej., Deepgram, Assembly AI, Azure) para conversion de voz a texto</li>
                <li><strong>Proveedores de calendario</strong> (ej., Google Calendar, Calendly, HubSpot, Cal.com) para programacion de citas</li>
              </ul>
              <p>Cada proveedor externo tiene su propia politica de privacidad que rige el uso de sus datos. Le recomendamos revisar sus respectivas politicas.</p>

              <h2>4. Compartir y Divulgar Datos</h2>
              <p>No vendemos su informacion personal. Podemos compartir datos en las siguientes circunstancias:</p>
              <ul>
                <li><strong>Con proveedores de servicios:</strong> Terceros que nos ayudan a operar el Servicio</li>
                <li><strong>Dentro de su organizacion:</strong> Las agencias pueden ver datos relacionados con las cuentas de sus clientes</li>
                <li><strong>Para cumplimiento legal:</strong> Cuando lo exija la ley, regulacion o proceso legal</li>
                <li><strong>Transferencias comerciales:</strong> En relacion con una fusion, adquisicion o venta de activos</li>
                <li><strong>Con su consentimiento:</strong> Cuando autorice explicitamente el intercambio de datos</li>
              </ul>

              <h2>5. Seguridad de los Datos</h2>
              <p>Implementamos medidas de seguridad estandar de la industria para proteger su informacion, incluyendo:</p>
              <ul>
                <li>Encriptacion AES-256-GCM para datos sensibles en reposo</li>
                <li>Encriptacion TLS/HTTPS para datos en transito</li>
                <li>Autenticacion basada en JWT y controles de acceso basados en roles</li>
                <li>Auditorias de seguridad y monitoreo regular</li>
              </ul>
              <p>A pesar de estas medidas, ningun metodo de transmision o almacenamiento es 100% seguro. No podemos garantizar la seguridad absoluta de sus datos.</p>

              <h2>6. Cumplimiento HIPAA</h2>
              <p>Para casos de uso relacionados con la salud, nuestra plataforma soporta funciones de cumplimiento HIPAA. Si requiere cumplimiento HIPAA, se debe ejecutar un Acuerdo de Asociado Comercial (BAA) entre su organizacion y Appex Innovations antes de procesar Informacion de Salud Protegida (PHI).</p>

              <h2>7. Retencion de Datos</h2>
              <p>Retenemos su informacion mientras su cuenta este activa o sea necesaria para proporcionar el Servicio. Las grabaciones de llamadas y transcripciones se retienen segun la configuracion de su cuenta y los requisitos legales aplicables. Puede solicitar la eliminacion de sus datos en cualquier momento contactandonos.</p>

              <h2>8. Sus Derechos</h2>
              <p>Dependiendo de su jurisdiccion, puede tener los siguientes derechos:</p>
              <ul>
                <li><strong>Acceso:</strong> Solicitar una copia de los datos personales que tenemos sobre usted</li>
                <li><strong>Correccion:</strong> Solicitar la correccion de datos inexactos</li>
                <li><strong>Eliminacion:</strong> Solicitar la eliminacion de sus datos personales</li>
                <li><strong>Portabilidad:</strong> Solicitar una copia legible por maquina de sus datos</li>
                <li><strong>Oposicion:</strong> Oponerse a cierto procesamiento de sus datos</li>
                <li><strong>Restriccion:</strong> Solicitar la restriccion del procesamiento</li>
              </ul>
              <p>Para ejercer cualquiera de estos derechos, contactenos a la direccion de correo electronico a continuacion.</p>

              <h2>9. Cookies</h2>
              <p>Utilizamos cookies esenciales para mantener su sesion y preferencias (como tokens de autenticacion, tema e idioma). No utilizamos cookies de publicidad o seguimiento de terceros.</p>

              <h2>10. Privacidad de Menores</h2>
              <p>Nuestro Servicio no esta dirigido a personas menores de 18 anos. No recopilamos intencionalmente informacion personal de menores. Si tenemos conocimiento de dichos datos, tomaremos medidas para eliminarlos de inmediato.</p>

              <h2>11. Transferencias Internacionales de Datos</h2>
              <p>Su informacion puede ser transferida y procesada en paises distintos al suyo. Tomamos las medidas de seguridad apropiadas para garantizar que sus datos esten protegidos de acuerdo con esta politica.</p>

              <h2>12. Cambios a Esta Politica</h2>
              <p>Podemos actualizar esta Politica de Privacidad periodicamente. Le notificaremos sobre cambios significativos publicando la politica actualizada en el Servicio y actualizando la fecha de "Ultima actualizacion". El uso continuado del Servicio despues de los cambios constituye la aceptacion de la politica actualizada.</p>

              <h2>13. Contactenos</h2>
              <p>Si tiene preguntas sobre esta Politica de Privacidad, contactenos en:</p>
              <p><strong>Appex Innovations</strong><br />Email: privacy@appexinnovations.com</p>
            </div>
          )}
        </div>

        {/* Footer links */}
        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400 space-x-4">
          <Link to="/terms" className="hover:text-primary-600 dark:hover:text-primary-400 underline">
            {language === 'en' ? 'Terms of Service' : 'Terminos de Servicio'}
          </Link>
          <span>&middot;</span>
          <Link to="/privacy" className="text-primary-600 dark:text-primary-400 font-medium">
            {language === 'en' ? 'Privacy Policy' : 'Politica de Privacidad'}
          </Link>
        </div>
      </div>
    </div>
  )
}
