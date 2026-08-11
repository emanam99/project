import PaymentGatewaySection from '../Pendaftaran/components/pengaturan/PaymentGatewaySection'

/**
 * Pengaturan Payment Gateway (iPayMu / Xendit) — grup menu Pengaturan.
 */
export default function PaymentGateway() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          <PaymentGatewaySection />
        </div>
      </div>
    </div>
  )
}
