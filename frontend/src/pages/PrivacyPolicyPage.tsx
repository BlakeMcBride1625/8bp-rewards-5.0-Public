import React from 'react';
import { motion } from 'framer-motion';
import { Lock, Shield } from 'lucide-react';

const PrivacyPolicyPage: React.FC = () => {
  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <div className="w-16 h-16 bg-primary-100 dark:bg-gradient-to-br dark:from-blue-500 dark:to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg dark:shadow-blue-500/40">
            <Lock className="w-8 h-8 text-primary-600 dark:text-text-dark-highlight" />
          </div>
          <h1 className="text-4xl font-bold text-text-primary dark:text-text-dark-primary mb-4">
            Privacy Policy
          </h1>
          <p className="text-text-secondary dark:text-text-dark-secondary">
            Last Updated: 23 November 2025
          </p>
        </motion.div>

        {/* Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="card space-y-6"
        >
          <section>
            <h2 className="text-2xl font-bold text-text-primary dark:text-text-dark-primary mb-4">
              1. Information We Collect
            </h2>
            <p className="text-text-secondary dark:text-text-dark-secondary leading-relaxed mb-3">
              We collect the following information when you use our Service:
            </p>
            <ul className="list-disc list-inside text-text-secondary dark:text-text-dark-secondary space-y-2 ml-4">
              <li><strong>8 Ball Pool User ID:</strong> Your unique identifier for the 8 Ball Pool game</li>
              <li><strong>Username:</strong> The display name you provide during registration or as detected from verification screenshots</li>
              <li><strong>Discord Information:</strong> If you use Discord OAuth login, we store your Discord user ID, username, discriminator, and avatar. This is also used for account verification.</li>
              <li><strong>Verification Data:</strong> If you choose to verify your account via our Discord bot, we collect and store your account level, rank name, and any information extracted from submitted screenshots</li>
              <li><strong>Claim Records:</strong> Information about reward claims including timestamps, claimed items, claim status, and associated metadata</li>
              <li><strong>Screenshots:</strong> Automatic screenshots captured during claim processes (confirmation images, shop page, ID entry, etc.) and any screenshots you submit for account verification</li>
              <li><strong>System Logs:</strong> Technical logs for system monitoring, troubleshooting, and security auditing</li>
              <li><strong>IP Address:</strong> Temporarily logged for security, abuse prevention, and to comply with legal requirements</li>
              <li><strong>Device Information:</strong> Device type, user agent, and device ID may be collected during registration</li>
              <li><strong>Deregistration Requests:</strong> Information related to account removal requests including timestamps and IP addresses</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-text-primary dark:text-text-dark-primary mb-4">
              2. How We Use Your Information
            </h2>
            <p className="text-text-secondary dark:text-text-dark-secondary leading-relaxed mb-3">
              We use the collected information to:
            </p>
            <ul className="list-disc list-inside text-text-secondary dark:text-text-dark-secondary space-y-2 ml-4">
              <li>Automatically claim daily rewards from 8 Ball Pool on your behalf</li>
              <li>Display statistics, claim history, and verification status in your user dashboard</li>
              <li>Maintain leaderboard rankings with verified account information (level, rank, username)</li>
              <li>Send Discord notifications about reward claims and account status (if enabled)</li>
              <li>Process account verification requests and match verification data to your account</li>
              <li>Store and display screenshots of claim confirmations for your reference</li>
              <li>Monitor system performance, troubleshoot issues, and improve service quality</li>
              <li>Prevent abuse, fraud, and maintain service integrity</li>
              <li>Respond to your support requests, inquiries, and deregistration requests</li>
              <li>Comply with legal obligations and enforce our Terms of Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-text-primary dark:text-text-dark-primary mb-4">
              3. Data Storage and Security
            </h2>
            <p className="text-text-secondary dark:text-text-dark-secondary leading-relaxed mb-3">
              Your data is stored securely:
            </p>
            <ul className="list-disc list-inside text-text-secondary dark:text-text-dark-secondary space-y-2 ml-4">
              <li><strong>Database:</strong> We use PostgreSQL with industry-standard encryption and secure access controls. All user, verification, claim, and screenshot metadata is stored in a unified database</li>
              <li><strong>Screenshot Storage:</strong> Screenshots are stored on secure file systems with restricted access. Only you and authorised administrators can view your screenshots</li>
              <li><strong>Access Control:</strong> Only authorised administrators can access user data. Role-based access (Owner, Admin, Member) ensures appropriate data access levels</li>
              <li><strong>No Passwords:</strong> We never collect or store your 8 Ball Pool password or Discord password</li>
              <li><strong>Secure Transmission:</strong> All data is transmitted over HTTPS in production</li>
              <li><strong>Regular Backups:</strong> Data is backed up regularly to prevent loss and ensure service continuity</li>
              <li><strong>Data Encryption:</strong> Sensitive data is encrypted at rest and in transit</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-text-primary dark:text-text-dark-primary mb-4">
              4. Screenshot Storage and Usage
            </h2>
            <p className="text-text-secondary dark:text-text-dark-secondary leading-relaxed mb-3">
              Screenshots are an important part of our Service:
            </p>
            <ul className="list-disc list-inside text-text-secondary dark:text-text-dark-secondary space-y-2 ml-4">
              <li><strong>Automatic Screenshots:</strong> We automatically capture screenshots during claim processes (confirmation images, shop page, etc.) for verification and troubleshooting</li>
              <li><strong>Verification Screenshots:</strong> Screenshots you submit via Discord for account verification are processed using automated image recognition (OCR/Vision API) to extract account information</li>
              <li><strong>Access:</strong> Screenshots are accessible to you through your user dashboard and to authorised administrators for system management</li>
              <li><strong>Retention:</strong> Screenshots are retained while your account is active. You may request deletion of specific screenshots or all screenshots through your dashboard</li>
              <li><strong>Purpose:</strong> Screenshots are used for claim verification, troubleshooting, account verification, and service improvement</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-text-primary dark:text-text-dark-primary mb-4">
              5. Account Verification Data
            </h2>
            <p className="text-text-secondary dark:text-text-dark-secondary leading-relaxed mb-3">
              If you choose to verify your account via our Discord bot:
            </p>
            <ul className="list-disc list-inside text-text-secondary dark:text-text-dark-secondary space-y-2 ml-4">
              <li>We extract and store your 8 Ball Pool account level, rank name, and username from submitted screenshots</li>
              <li>This information is displayed on the public leaderboard (if your account appears there)</li>
              <li>Verification data is linked to your Discord account ID for account matching</li>
              <li>Verification is optional and you can continue using the Service without verification</li>
              <li>You may request removal of verification data by contacting us or submitting a deregistration request</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-text-primary dark:text-text-dark-primary mb-4">
              6. Data Sharing and Disclosure
            </h2>
            <p className="text-text-secondary dark:text-text-dark-secondary leading-relaxed">
              We do NOT sell, trade, or rent your personal information to third parties. We may share your information only in the following circumstances:
            </p>
            <ul className="list-disc list-inside text-text-secondary dark:text-text-dark-secondary space-y-2 ml-4 mt-3">
              <li>With Discord (for bot notifications, OAuth authentication, and verification services, if you've authorised Discord integration)</li>
              <li>With OpenAI (for Vision API processing of verification screenshots - images are processed but not stored by OpenAI)</li>
              <li>When required by law, court order, or to protect our legal rights</li>
              <li>With service providers who assist in operating our Service (e.g., PostgreSQL hosting, cloud storage providers) under strict confidentiality agreements</li>
              <li>In case of a merger, acquisition, or sale of assets, where user data may be transferred as part of the business transaction</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-text-primary dark:text-text-dark-primary mb-4">
              7. Third-Party Services
            </h2>
            <p className="text-text-secondary dark:text-text-dark-secondary leading-relaxed">
              Our Service interacts with third-party platforms including 8 Ball Pool (Miniclip), Discord, and OpenAI (for image processing). These services have their own privacy policies, and we encourage you to review them. We are not responsible for the privacy practices of these third-party services. When you use Discord OAuth, you are also subject to Discord's privacy policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-text-primary dark:text-text-dark-primary mb-4">
              8. Your Rights
            </h2>
            <p className="text-text-secondary dark:text-text-dark-secondary leading-relaxed mb-3">
              You have the right to:
            </p>
            <ul className="list-disc list-inside text-text-secondary dark:text-text-dark-secondary space-y-2 ml-4">
              <li>Access your personal data stored in our system through your user dashboard</li>
              <li>Request correction of inaccurate data, including username, verification information, etc.</li>
              <li>Request deletion of your account and associated data (screenshots, claim records, verification data)</li>
              <li>Request deletion of specific screenshots while keeping your account active</li>
              <li>Opt-out of Discord notifications while continuing to use the Service</li>
              <li>Withdraw consent for data processing at any time</li>
              <li>Request a copy of your data in a portable format</li>
              <li>Object to processing of your data for certain purposes</li>
            </ul>
            <p className="text-text-secondary dark:text-text-dark-secondary leading-relaxed mt-3">
              To exercise these rights, please contact us at connectwithme@epildevconnect.uk or use the Contact page. You may also submit a deregistration request through your user dashboard.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-text-primary dark:text-text-dark-primary mb-4">
              9. Data Retention
            </h2>
            <p className="text-text-secondary dark:text-text-dark-secondary leading-relaxed">
              We retain your registration data, claim history, verification data, and screenshots for as long as your account is active. If you request account deletion, we will remove your personal information within 30 days, though some data may be retained for legal compliance, dispute resolution, or security purposes (e.g., to prevent re-registration after abuse). Logs may be retained for up to 90 days for security auditing purposes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-text-primary dark:text-text-dark-primary mb-4">
              10. Cookies and Tracking
            </h2>
            <p className="text-text-secondary dark:text-text-dark-secondary leading-relaxed">
              Our Service uses minimal cookies for essential functionality such as session management and authentication. We do not use tracking cookies or third-party analytics. Your theme preference (dark/light mode) is stored in your browser's local storage. Session cookies are necessary for maintaining your login state and expire when you close your browser.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-text-primary dark:text-text-dark-primary mb-4">
              11. Children's Privacy
            </h2>
            <p className="text-text-secondary dark:text-text-dark-secondary leading-relaxed">
              Our Service is not intended for children under 13 years of age. We do not knowingly collect personal information from children. If you believe we have collected information from a child, please contact us immediately and we will take steps to remove that information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-text-primary dark:text-text-dark-primary mb-4">
              12. International Data Transfers
            </h2>
            <p className="text-text-secondary dark:text-text-dark-secondary leading-relaxed">
              Your data may be processed and stored in servers located outside your country of residence. We ensure appropriate safeguards are in place to protect your data in accordance with this Privacy Policy and applicable data protection laws.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-text-primary dark:text-text-dark-primary mb-4">
              13. Changes to Privacy Policy
            </h2>
            <p className="text-text-secondary dark:text-text-dark-secondary leading-relaxed">
              We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements. We will notify users of any material changes by updating the "Last Updated" date at the top of this policy and, where appropriate, through email or Service notifications. Your continued use of the Service after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-text-primary dark:text-text-dark-primary mb-4">
              14. Contact Us
            </h2>
            <p className="text-text-secondary dark:text-text-dark-secondary leading-relaxed">
              If you have any questions or concerns about this Privacy Policy or our data practices, please contact us:
            </p>
            <div className="mt-3 p-4 bg-gray-50 dark:bg-background-dark-tertiary rounded-lg">
              <p className="text-text-secondary dark:text-text-dark-secondary">
                <strong>Email:</strong> connectwithme@epildevconnect.uk<br />
                <strong>Website:</strong> https://8ballpool.website/8bp-rewards/contact
              </p>
            </div>
          </section>

          <div className="mt-8 p-4 bg-green-50 dark:bg-background-dark-tertiary border border-green-200 dark:border-dark-accent-ocean rounded-lg">
            <div className="flex items-start space-x-3">
              <Shield className="w-5 h-5 text-green-600 dark:text-dark-accent-ocean mt-0.5" />
              <div>
                <h3 className="font-semibold text-green-900 dark:text-text-dark-primary mb-1">
                  Your Privacy Matters
                </h3>
                <p className="text-sm text-green-700 dark:text-text-dark-secondary">
                  We take your privacy seriously and are committed to protecting your personal information. We only collect what's necessary to provide the Service and never share your data with unauthorised parties. You have control over your data and can request access, correction, or deletion at any time.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;