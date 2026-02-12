import { Link } from 'react-router-dom'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'

export default function TermsOfService() {
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
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Terms of Service</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Last updated: {lastUpdated}</p>

              <p>Welcome to Appex Innovations. By accessing or using our platform (the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Service.</p>

              <h2>1. Acceptance of Terms</h2>
              <p>By creating an account or using the Service, you confirm that you are at least 18 years old and have the legal authority to enter into these Terms. If you are using the Service on behalf of an organization, you represent that you have the authority to bind that organization to these Terms.</p>

              <h2>2. Description of Service</h2>
              <p>Appex Innovations provides an AI-powered voice agent platform that enables users to:</p>
              <ul>
                <li>Create and configure AI voice agents for inbound and outbound calls</li>
                <li>Manage phone numbers and telephony integrations</li>
                <li>Schedule appointments through calendar integrations</li>
                <li>View call logs, analytics, and transcriptions</li>
                <li>Manage sub-accounts for agencies and their clients</li>
              </ul>

              <h2>3. Account Registration</h2>
              <ul>
                <li>You must provide accurate and complete information when creating an account</li>
                <li>You are responsible for maintaining the confidentiality of your login credentials</li>
                <li>You are responsible for all activities that occur under your account</li>
                <li>You must notify us immediately of any unauthorized access to your account</li>
              </ul>

              <h2>4. Credits and Billing</h2>
              <h3>4.1 Credit System</h3>
              <p>The Service operates on a credit-based billing system. Credits are consumed based on call duration and the AI models and transcription services used during each call.</p>

              <h3>4.2 Rates</h3>
              <p>Per-minute rates are determined by the platform owner (base rates) and may be customized per account. Rates vary depending on the AI model and transcriber selected for each agent.</p>

              <h3>4.3 No Refunds</h3>
              <p>Credits are non-refundable except as required by applicable law. Unused credits remain in your account until used or your account is terminated.</p>

              <h2>5. Acceptable Use</h2>
              <p>You agree not to use the Service to:</p>
              <ul>
                <li>Violate any applicable laws, regulations, or third-party rights</li>
                <li>Make automated calls that violate telemarketing laws (TCPA, DNC regulations, or equivalent)</li>
                <li>Engage in harassment, fraud, or deceptive practices</li>
                <li>Impersonate any person or entity</li>
                <li>Transmit malware, viruses, or harmful code</li>
                <li>Attempt to gain unauthorized access to the Service or its systems</li>
                <li>Use the Service for illegal robocalling or spam</li>
                <li>Process sensitive data (health, financial, etc.) without appropriate compliance measures</li>
              </ul>

              <h2>6. Agency and Client Accounts</h2>
              <p>If you operate as an Agency on the platform:</p>
              <ul>
                <li>You are responsible for ensuring your clients comply with these Terms</li>
                <li>You may set custom pricing for your clients, subject to the minimum rates set by the platform owner</li>
                <li>You may manage credits and settings for your client accounts</li>
                <li>The platform owner retains the right to suspend or terminate any account for violations</li>
              </ul>

              <h2>7. Intellectual Property</h2>
              <ul>
                <li>The Service, including its design, code, and branding, is owned by Appex Innovations</li>
                <li>You retain ownership of your content (agent configurations, custom prompts, uploaded data)</li>
                <li>You grant us a limited license to use your content solely to provide the Service</li>
                <li>AI-generated outputs (call responses, transcriptions) are provided "as-is" and may not be fully accurate</li>
              </ul>

              <h2>8. Third-Party Services</h2>
              <p>The Service integrates with third-party providers (VAPI, Twilio, AI model providers, calendar services, etc.). Your use of these integrations is subject to their respective terms of service. We are not responsible for the availability, accuracy, or policies of third-party services.</p>

              <h2>9. Data and Privacy</h2>
              <p>Your use of the Service is also governed by our <a href="/privacy">Privacy Policy</a>. By using the Service, you consent to the collection and use of data as described in the Privacy Policy.</p>

              <h2>10. HIPAA and Healthcare Compliance</h2>
              <p>If you intend to use the Service with Protected Health Information (PHI), you must:</p>
              <ul>
                <li>Enable HIPAA compliance features in your account settings</li>
                <li>Execute a Business Associate Agreement (BAA) with Appex Innovations</li>
                <li>Ensure your use of the Service complies with all applicable healthcare regulations</li>
              </ul>

              <h2>11. Service Availability</h2>
              <p>We strive to maintain high availability but do not guarantee uninterrupted access. The Service may be temporarily unavailable due to maintenance, updates, or circumstances beyond our control. We are not liable for any losses resulting from service downtime.</p>

              <h2>12. Limitation of Liability</h2>
              <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW:</p>
              <ul>
                <li>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND</li>
                <li>WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE</li>
                <li>WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES</li>
                <li>OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID TO US IN THE 12 MONTHS PRECEDING THE CLAIM</li>
              </ul>

              <h2>13. Indemnification</h2>
              <p>You agree to indemnify and hold harmless Appex Innovations, its officers, directors, employees, and agents from any claims, damages, losses, or expenses arising from your use of the Service, violation of these Terms, or infringement of any third-party rights.</p>

              <h2>14. Termination</h2>
              <ul>
                <li>You may close your account at any time by contacting us</li>
                <li>We may suspend or terminate your account for violations of these Terms</li>
                <li>Upon termination, your right to use the Service ceases immediately</li>
                <li>We may retain certain data as required by law or for legitimate business purposes</li>
              </ul>

              <h2>15. Modifications to Terms</h2>
              <p>We reserve the right to modify these Terms at any time. Material changes will be communicated through the Service or via email. Continued use after changes constitutes acceptance of the updated Terms.</p>

              <h2>16. Governing Law</h2>
              <p>These Terms shall be governed by and construed in accordance with the laws of the jurisdiction where Appex Innovations is incorporated, without regard to conflict of law provisions.</p>

              <h2>17. Contact Us</h2>
              <p>For questions about these Terms, please contact us at:</p>
              <p><strong>Appex Innovations</strong><br />Email: legal@appexinnovations.com</p>
            </div>
          ) : (
            <div className="prose prose-gray dark:prose-invert max-w-none">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Terminos de Servicio</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Ultima actualizacion: {lastUpdatedEs}</p>

              <p>Bienvenido a Appex Innovations. Al acceder o usar nuestra plataforma (el "Servicio"), usted acepta estar sujeto a estos Terminos de Servicio ("Terminos"). Si no esta de acuerdo con estos Terminos, no use el Servicio.</p>

              <h2>1. Aceptacion de los Terminos</h2>
              <p>Al crear una cuenta o usar el Servicio, confirma que tiene al menos 18 anos y la autoridad legal para aceptar estos Terminos. Si usa el Servicio en nombre de una organizacion, declara que tiene la autoridad para vincular a dicha organizacion con estos Terminos.</p>

              <h2>2. Descripcion del Servicio</h2>
              <p>Appex Innovations proporciona una plataforma de agentes de voz impulsados por IA que permite a los usuarios:</p>
              <ul>
                <li>Crear y configurar agentes de voz IA para llamadas entrantes y salientes</li>
                <li>Gestionar numeros de telefono e integraciones de telefonia</li>
                <li>Programar citas a traves de integraciones de calendario</li>
                <li>Ver registros de llamadas, analiticas y transcripciones</li>
                <li>Gestionar subcuentas para agencias y sus clientes</li>
              </ul>

              <h2>3. Registro de Cuenta</h2>
              <ul>
                <li>Debe proporcionar informacion precisa y completa al crear una cuenta</li>
                <li>Es responsable de mantener la confidencialidad de sus credenciales de acceso</li>
                <li>Es responsable de todas las actividades que ocurran bajo su cuenta</li>
                <li>Debe notificarnos inmediatamente sobre cualquier acceso no autorizado a su cuenta</li>
              </ul>

              <h2>4. Creditos y Facturacion</h2>
              <h3>4.1 Sistema de Creditos</h3>
              <p>El Servicio opera con un sistema de facturacion basado en creditos. Los creditos se consumen segun la duracion de la llamada y los modelos de IA y servicios de transcripcion utilizados durante cada llamada.</p>

              <h3>4.2 Tarifas</h3>
              <p>Las tarifas por minuto son determinadas por el propietario de la plataforma (tarifas base) y pueden personalizarse por cuenta. Las tarifas varian segun el modelo de IA y el transcriptor seleccionado para cada agente.</p>

              <h3>4.3 Sin Reembolsos</h3>
              <p>Los creditos no son reembolsables excepto segun lo requiera la ley aplicable. Los creditos no utilizados permanecen en su cuenta hasta que se usen o se termine su cuenta.</p>

              <h2>5. Uso Aceptable</h2>
              <p>Usted acepta no usar el Servicio para:</p>
              <ul>
                <li>Violar cualquier ley, regulacion o derechos de terceros aplicables</li>
                <li>Realizar llamadas automatizadas que violen las leyes de telemarketing (TCPA, regulaciones DNC o equivalentes)</li>
                <li>Participar en acoso, fraude o practicas enganosas</li>
                <li>Suplantar la identidad de cualquier persona o entidad</li>
                <li>Transmitir malware, virus o codigo danino</li>
                <li>Intentar obtener acceso no autorizado al Servicio o sus sistemas</li>
                <li>Usar el Servicio para llamadas automaticas ilegales o spam</li>
                <li>Procesar datos sensibles (salud, financieros, etc.) sin las medidas de cumplimiento apropiadas</li>
              </ul>

              <h2>6. Cuentas de Agencia y Cliente</h2>
              <p>Si opera como Agencia en la plataforma:</p>
              <ul>
                <li>Es responsable de asegurar que sus clientes cumplan con estos Terminos</li>
                <li>Puede establecer precios personalizados para sus clientes, sujeto a las tarifas minimas establecidas por el propietario de la plataforma</li>
                <li>Puede gestionar creditos y configuraciones para las cuentas de sus clientes</li>
                <li>El propietario de la plataforma se reserva el derecho de suspender o terminar cualquier cuenta por violaciones</li>
              </ul>

              <h2>7. Propiedad Intelectual</h2>
              <ul>
                <li>El Servicio, incluyendo su diseno, codigo y marca, es propiedad de Appex Innovations</li>
                <li>Usted retiene la propiedad de su contenido (configuraciones de agentes, prompts personalizados, datos cargados)</li>
                <li>Nos otorga una licencia limitada para usar su contenido unicamente para proporcionar el Servicio</li>
                <li>Las salidas generadas por IA (respuestas de llamadas, transcripciones) se proporcionan "tal cual" y pueden no ser completamente precisas</li>
              </ul>

              <h2>8. Servicios de Terceros</h2>
              <p>El Servicio se integra con proveedores externos (VAPI, Twilio, proveedores de modelos IA, servicios de calendario, etc.). Su uso de estas integraciones esta sujeto a sus respectivos terminos de servicio. No somos responsables de la disponibilidad, precision o politicas de los servicios de terceros.</p>

              <h2>9. Datos y Privacidad</h2>
              <p>Su uso del Servicio tambien se rige por nuestra <a href="/privacy">Politica de Privacidad</a>. Al usar el Servicio, consiente la recopilacion y uso de datos como se describe en la Politica de Privacidad.</p>

              <h2>10. HIPAA y Cumplimiento en Salud</h2>
              <p>Si tiene la intencion de usar el Servicio con Informacion de Salud Protegida (PHI), debe:</p>
              <ul>
                <li>Habilitar las funciones de cumplimiento HIPAA en la configuracion de su cuenta</li>
                <li>Ejecutar un Acuerdo de Asociado Comercial (BAA) con Appex Innovations</li>
                <li>Asegurar que su uso del Servicio cumpla con todas las regulaciones de salud aplicables</li>
              </ul>

              <h2>11. Disponibilidad del Servicio</h2>
              <p>Nos esforzamos por mantener alta disponibilidad pero no garantizamos acceso ininterrumpido. El Servicio puede no estar disponible temporalmente debido a mantenimiento, actualizaciones o circunstancias fuera de nuestro control. No somos responsables por perdidas resultantes del tiempo de inactividad del servicio.</p>

              <h2>12. Limitacion de Responsabilidad</h2>
              <p>EN LA MAXIMA MEDIDA PERMITIDA POR LA LEY:</p>
              <ul>
                <li>EL SERVICIO SE PROPORCIONA "TAL CUAL" Y "SEGUN DISPONIBILIDAD" SIN GARANTIAS DE NINGUN TIPO</li>
                <li>RECHAZAMOS TODAS LAS GARANTIAS, EXPRESAS O IMPLICITAS, INCLUYENDO COMERCIABILIDAD E IDONEIDAD PARA UN PROPOSITO PARTICULAR</li>
                <li>NO SEREMOS RESPONSABLES POR DANOS INDIRECTOS, INCIDENTALES, ESPECIALES, CONSECUENTES O PUNITIVOS</li>
                <li>NUESTRA RESPONSABILIDAD TOTAL NO EXCEDERA LA CANTIDAD QUE NOS PAGO EN LOS 12 MESES ANTERIORES A LA RECLAMACION</li>
              </ul>

              <h2>13. Indemnizacion</h2>
              <p>Usted acepta indemnizar y mantener indemne a Appex Innovations, sus directivos, directores, empleados y agentes de cualquier reclamacion, dano, perdida o gasto que surja de su uso del Servicio, violacion de estos Terminos o infraccion de derechos de terceros.</p>

              <h2>14. Terminacion</h2>
              <ul>
                <li>Puede cerrar su cuenta en cualquier momento contactandonos</li>
                <li>Podemos suspender o terminar su cuenta por violaciones de estos Terminos</li>
                <li>Tras la terminacion, su derecho a usar el Servicio cesa inmediatamente</li>
                <li>Podemos retener ciertos datos segun lo requiera la ley o para fines comerciales legitimos</li>
              </ul>

              <h2>15. Modificaciones a los Terminos</h2>
              <p>Nos reservamos el derecho de modificar estos Terminos en cualquier momento. Los cambios materiales se comunicaran a traves del Servicio o por correo electronico. El uso continuado despues de los cambios constituye la aceptacion de los Terminos actualizados.</p>

              <h2>16. Ley Aplicable</h2>
              <p>Estos Terminos se regiran e interpretaran de acuerdo con las leyes de la jurisdiccion donde Appex Innovations esta incorporada, sin tener en cuenta las disposiciones sobre conflictos de leyes.</p>

              <h2>17. Contactenos</h2>
              <p>Para preguntas sobre estos Terminos, contactenos en:</p>
              <p><strong>Appex Innovations</strong><br />Email: legal@appexinnovations.com</p>
            </div>
          )}
        </div>

        {/* Footer links */}
        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400 space-x-4">
          <Link to="/terms" className="text-primary-600 dark:text-primary-400 font-medium">
            {language === 'en' ? 'Terms of Service' : 'Terminos de Servicio'}
          </Link>
          <span>&middot;</span>
          <Link to="/privacy" className="hover:text-primary-600 dark:hover:text-primary-400 underline">
            {language === 'en' ? 'Privacy Policy' : 'Politica de Privacidad'}
          </Link>
        </div>
      </div>
    </div>
  )
}
