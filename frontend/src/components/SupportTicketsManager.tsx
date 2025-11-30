import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import {
	MessageSquare,
	Download,
	X,
	Send,
	Trash2,
	Search,
	Filter,
	Clock,
	CheckCircle,
	XCircle,
	FileText,
	Loader,
	AlertCircle
} from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';
import { useTicketMessages } from '../hooks/useWebSocket';

interface Ticket {
	id: string;
	ticket_number: string;
	ticket_type: 'email' | 'website';
	discord_id?: string;
	status: 'open' | 'closed';
	category?: string;
	subject: string;
	created_at: string;
	closed_at?: string;
	closed_by?: string;
	close_reason?: string;
	metadata?: any;
}

interface Message {
	id: string;
	sender_type: 'user' | 'admin' | 'system';
	sender_discord_id?: string;
	message: string;
	created_at: string;
}

interface Attachment {
	id: string;
	file_name: string;
	file_size: number;
	mime_type: string;
	created_at: string;
}

const SupportTicketsManager: React.FC = () => {
	const [tickets, setTickets] = useState<Ticket[]>([]);
	const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
	const [messages, setMessages] = useState<Message[]>([]);
	const [attachments, setAttachments] = useState<Attachment[]>([]);
	const [messageInput, setMessageInput] = useState('');
	const [closeReason, setCloseReason] = useState('');
	const [showCloseModal, setShowCloseModal] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [isSending, setIsSending] = useState(false);
	const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
	const [ticketType, setTicketType] = useState<'all' | 'email' | 'website'>('all');
	const [searchQuery, setSearchQuery] = useState('');
	const messagesEndRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		fetchTickets();
	}, [filter, ticketType]);

	// WebSocket for real-time updates
	const { newMessage: wsNewMessage, consumeNewMessage } = useTicketMessages(selectedTicket?.id || null);

	useEffect(() => {
		if (selectedTicket) {
			fetchTicketDetails(selectedTicket.id);
		}
	}, [selectedTicket]);

	// Handle new WebSocket messages
	useEffect(() => {
		if (wsNewMessage && selectedTicket) {
			setMessages((prev) => [...prev, wsNewMessage]);
			consumeNewMessage();
		}
	}, [wsNewMessage, selectedTicket, consumeNewMessage]);

	useEffect(() => {
		scrollToBottom();
	}, [messages]);

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	};

	const fetchTickets = async () => {
		try {
			setIsLoading(true);
			const response = await axios.get(API_ENDPOINTS.ADMIN_TICKETS, {
				params: { status: filter, type: ticketType },
				withCredentials: true
			});
			setTickets(response.data.tickets || []);
		} catch (error) {
			console.error('Failed to fetch tickets:', error);
			toast.error('Failed to load tickets');
		} finally {
			setIsLoading(false);
		}
	};

	const fetchTicketDetails = async (ticketId: string) => {
		try {
			const [messagesRes, ticketRes] = await Promise.all([
				axios.get(`${API_ENDPOINTS.ADMIN_TICKETS}/${ticketId}/messages`, {
					withCredentials: true
				}),
				axios.get(`${API_ENDPOINTS.ADMIN_TICKETS}/${ticketId}`, {
					withCredentials: true
				})
			]);

			setMessages(messagesRes.data.messages || []);
			setAttachments(ticketRes.data.attachments || []);
		} catch (error) {
			console.error('Failed to fetch ticket details:', error);
		}
	};

	const sendMessage = async () => {
		if (!selectedTicket || !messageInput.trim() || selectedTicket.status === 'closed') {
			return;
		}

		try {
			setIsSending(true);
			await axios.post(
				`${API_ENDPOINTS.ADMIN_TICKETS}/${selectedTicket.id}/messages`,
				{ message: messageInput.trim() },
				{ withCredentials: true }
			);

			setMessageInput('');
			await fetchTicketDetails(selectedTicket.id);
			await fetchTickets();
		} catch (error: any) {
			console.error('Failed to send message:', error);
			toast.error(error.response?.data?.error || 'Failed to send message');
		} finally {
			setIsSending(false);
		}
	};

	const handleCloseTicket = async () => {
		if (!selectedTicket || !closeReason.trim()) {
			toast.error('Please provide a close reason');
			return;
		}

		try {
			await axios.post(
				API_ENDPOINTS.ADMIN_TICKET_CLOSE(selectedTicket.id),
				{ close_reason: closeReason.trim() },
				{ withCredentials: true }
			);

			toast.success('Ticket closed successfully');
			setShowCloseModal(false);
			setCloseReason('');
			await fetchTickets();
			// Update selected ticket
			const updatedTicket = tickets.find(t => t.id === selectedTicket.id);
			if (updatedTicket) {
				setSelectedTicket({ ...updatedTicket, status: 'closed' });
			}
		} catch (error: any) {
			console.error('Failed to close ticket:', error);
			toast.error(error.response?.data?.error || 'Failed to close ticket');
		}
	};

	const handleDeleteTicket = async (ticketId: string) => {
		if (!window.confirm('Are you sure you want to delete this ticket? This action cannot be undone.')) {
			return;
		}

		try {
			await axios.delete(API_ENDPOINTS.ADMIN_TICKET_DELETE(ticketId), {
				withCredentials: true
			});

			toast.success('Ticket deleted successfully');
			if (selectedTicket?.id === ticketId) {
				setSelectedTicket(null);
			}
			await fetchTickets();
		} catch (error: any) {
			console.error('Failed to delete ticket:', error);
			toast.error(error.response?.data?.error || 'Failed to delete ticket');
		}
	};

	const downloadAttachment = async (attachmentId: string, fileName: string) => {
		if (!selectedTicket) return;

		try {
			const response = await axios.get(
				API_ENDPOINTS.ADMIN_TICKET_ATTACHMENT_DOWNLOAD(selectedTicket.id, attachmentId),
				{
					withCredentials: true,
					responseType: 'blob'
				}
			);

			const url = window.URL.createObjectURL(new Blob([response.data]));
			const link = document.createElement('a');
			link.href = url;
			link.setAttribute('download', fileName);
			document.body.appendChild(link);
			link.click();
			link.remove();
			window.URL.revokeObjectURL(url);
		} catch (error) {
			console.error('Failed to download attachment:', error);
			toast.error('Failed to download attachment');
		}
	};

	const formatDate = (dateString: string) => {
		const date = new Date(dateString);
		return date.toLocaleString('en-GB', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	};

	const formatFileSize = (bytes: number): string => {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
	};

	const filteredTickets = tickets.filter((ticket) => {
		const matchesSearch =
			ticket.ticket_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
			ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
			(ticket.category && ticket.category.toLowerCase().includes(searchQuery.toLowerCase()));
		return matchesSearch;
	});

	const emailTickets = filteredTickets.filter(t => t.ticket_type === 'email');
	const websiteTickets = filteredTickets.filter(t => t.ticket_type === 'website');

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<Loader className="w-8 h-8 animate-spin text-primary-500" />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Filters */}
			<div className="card">
				<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
					<div className="md:col-span-2">
						<div className="relative">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
							<input
								type="text"
								placeholder="Search tickets..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="input pl-10"
							/>
						</div>
					</div>
					<select
						value={filter}
						onChange={(e) => setFilter(e.target.value as any)}
						className="input"
					>
						<option value="all">All Status</option>
						<option value="open">Open</option>
						<option value="closed">Closed</option>
					</select>
					<select
						value={ticketType}
						onChange={(e) => setTicketType(e.target.value as any)}
						className="input"
					>
						<option value="all">All Types</option>
						<option value="email">Email (8RET-EN)</option>
						<option value="website">Website (8RWT-WN)</option>
					</select>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Tickets List */}
				<div className="lg:col-span-1 space-y-6">
					{/* Email Tickets */}
					<div className="card">
						<h3 className="text-lg font-semibold text-text-primary mb-4">
							Email Tickets (8RET-EN)
						</h3>
						{emailTickets.length === 0 ? (
							<p className="text-sm text-text-secondary text-center py-4">
								No email tickets
							</p>
						) : (
							<div className="space-y-2">
								{emailTickets.map((ticket) => (
									<button
										key={ticket.id}
										onClick={() => setSelectedTicket(ticket)}
										className={`w-full text-left p-3 rounded-lg border transition-colors ${
											selectedTicket?.id === ticket.id
												? 'bg-primary-50 dark:bg-primary-900/20 border-primary-500 dark:border-primary-400'
												: 'border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'
										}`}
									>
										<div className="flex items-start justify-between mb-1">
											<span className="text-sm font-medium text-text-primary">
												{ticket.ticket_number}
											</span>
											{ticket.status === 'open' ? (
												<span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
													Open
												</span>
											) : (
												<span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded">
													Closed
												</span>
											)}
										</div>
										<p className="text-xs text-text-secondary truncate">
											{ticket.subject}
										</p>
										<p className="text-xs text-text-secondary mt-1">
											{formatDate(ticket.created_at)}
										</p>
									</button>
								))}
							</div>
						)}
					</div>

					{/* Website Tickets */}
					<div className="card">
						<h3 className="text-lg font-semibold text-text-primary mb-4">
							Website Tickets (8RWT-WN)
						</h3>
						{websiteTickets.length === 0 ? (
							<p className="text-sm text-text-secondary text-center py-4">
								No website tickets
							</p>
						) : (
							<div className="space-y-2">
								{websiteTickets.map((ticket) => (
									<button
										key={ticket.id}
										onClick={() => setSelectedTicket(ticket)}
										className={`w-full text-left p-3 rounded-lg border transition-colors ${
											selectedTicket?.id === ticket.id
												? 'bg-primary-50 dark:bg-primary-900/20 border-primary-500 dark:border-primary-400'
												: 'border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'
										}`}
									>
										<div className="flex items-start justify-between mb-1">
											<span className="text-sm font-medium text-text-primary">
												{ticket.ticket_number}
											</span>
											{ticket.status === 'open' ? (
												<span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
													Open
												</span>
											) : (
												<span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded">
													Closed
												</span>
											)}
										</div>
										<p className="text-xs text-text-secondary truncate">
											{ticket.category || ticket.subject}
										</p>
										<p className="text-xs text-text-secondary mt-1">
											{formatDate(ticket.created_at)}
										</p>
									</button>
								))}
							</div>
						)}
					</div>
				</div>

				{/* Ticket Detail View */}
				<div className="lg:col-span-2">
					{selectedTicket ? (
						<div className="card flex flex-col h-[800px]">
							{/* Header */}
							<div className="border-b border-gray-200 dark:border-white/10 pb-4 mb-4">
								<div className="flex items-center justify-between mb-2">
									<div>
										<h3 className="text-lg font-semibold text-text-primary">
											{selectedTicket.ticket_number}
										</h3>
										<p className="text-sm text-text-secondary">
											{selectedTicket.ticket_type === 'email' ? 'Email Ticket' : 'Website Ticket'} • {formatDate(selectedTicket.created_at)}
										</p>
									</div>
									<div className="flex items-center space-x-2">
										{selectedTicket.status === 'open' && (
											<button
												onClick={() => setShowCloseModal(true)}
												className="px-3 py-1.5 text-sm bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-lg hover:bg-yellow-200 dark:hover:bg-yellow-900/40"
											>
												Close
											</button>
										)}
										<button
											onClick={() => handleDeleteTicket(selectedTicket.id)}
											className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded"
										>
											<Trash2 className="w-4 h-4" />
										</button>
									</div>
								</div>
								<div className="mt-2">
									<p className="text-sm text-text-primary">
										<strong>Subject:</strong> {selectedTicket.subject}
									</p>
									{selectedTicket.category && (
										<p className="text-sm text-text-secondary mt-1">
											<strong>Category:</strong> {selectedTicket.category}
										</p>
									)}
									{selectedTicket.close_reason && (
										<div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
											<p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">
												Close Reason:
											</p>
											<p className="text-sm text-yellow-700 dark:text-yellow-300">
												{selectedTicket.close_reason}
											</p>
										</div>
									)}
								</div>
							</div>

							{/* Attachments */}
							{attachments.length > 0 && (
								<div className="mb-4 pb-4 border-b border-gray-200 dark:border-white/10">
									<h4 className="text-sm font-semibold text-text-primary mb-2">
										Attachments ({attachments.length})
									</h4>
									<div className="space-y-2">
										{attachments.map((attachment) => (
											<button
												key={attachment.id}
												onClick={() => downloadAttachment(attachment.id, attachment.file_name)}
												className="w-full flex items-center justify-between p-2 bg-gray-50 dark:bg-white/5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
											>
												<div className="flex items-center space-x-2 flex-1 min-w-0">
													<FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
													<span className="text-sm text-text-secondary truncate">
														{attachment.file_name}
													</span>
													<span className="text-xs text-gray-400 flex-shrink-0">
														({formatFileSize(attachment.file_size)})
													</span>
												</div>
												<Download className="w-4 h-4 text-primary-500 flex-shrink-0" />
											</button>
										))}
									</div>
								</div>
							)}

							{/* Messages */}
							<div className="flex-1 overflow-y-auto space-y-4 mb-4">
								{messages.length === 0 ? (
									<div className="text-center py-8 text-text-secondary">
										<MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
										<p>No messages yet</p>
									</div>
								) : (
									messages.map((msg) => (
										<div
											key={msg.id}
											className={`flex ${
												msg.sender_type === 'admin' ? 'justify-end' : 'justify-start'
											}`}
										>
											<div
												className={`max-w-[80%] rounded-lg p-3 ${
													msg.sender_type === 'admin'
														? 'bg-blue-500 text-white'
														: msg.sender_type === 'user'
														? 'bg-primary-500 text-white'
														: 'bg-gray-100 dark:bg-white/5 text-text-secondary'
												}`}
											>
												<p className="text-sm whitespace-pre-wrap">{msg.message}</p>
												<p
													className={`text-xs mt-1 ${
														msg.sender_type === 'admin' || msg.sender_type === 'user'
															? 'text-white/70'
															: 'text-text-secondary'
													}`}
												>
													{formatDate(msg.created_at)}
												</p>
											</div>
										</div>
									))
								)}
								<div ref={messagesEndRef} />
							</div>

							{/* Message Input */}
							{selectedTicket.status === 'open' ? (
							<div className="flex space-x-2">
								<input
									type="text"
									value={messageInput}
									onChange={(e) => setMessageInput(e.target.value)}
									onKeyPress={(e) => {
										if (e.key === 'Enter' && !e.shiftKey) {
											e.preventDefault();
											sendMessage();
										}
									}}
									placeholder="Type your message..."
									className="flex-1 input"
									disabled={isSending}
								/>
								<button
									onClick={sendMessage}
									disabled={!messageInput.trim() || isSending}
									className="btn-primary px-4"
								>
										{isSending ? (
											<Loader className="w-4 h-4 animate-spin" />
										) : (
											<Send className="w-4 h-4" />
										)}
									</button>
								</div>
							) : (
								<div className="p-3 bg-gray-50 dark:bg-white/5 rounded-lg text-center text-sm text-text-secondary">
									This ticket is closed. You cannot send new messages.
								</div>
							)}
						</div>
					) : (
						<div className="card flex items-center justify-center h-[800px]">
							<div className="text-center">
								<MessageSquare className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
								<p className="text-text-secondary">
									Select a ticket to view details
								</p>
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Close Ticket Modal */}
			{showCloseModal && selectedTicket && (
				<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
					<motion.div
						initial={{ opacity: 0, scale: 0.9 }}
						animate={{ opacity: 1, scale: 1 }}
						className="card max-w-md w-full mx-4"
					>
						<h3 className="text-lg font-semibold text-text-primary mb-4">
							Close Ticket {selectedTicket.ticket_number}
						</h3>
						<div className="mb-4">
							<label className="label mb-2">Close Reason (Required)</label>
							<textarea
								value={closeReason}
								onChange={(e) => setCloseReason(e.target.value)}
								rows={4}
								className="input resize-none"
								placeholder="Enter the reason for closing this ticket..."
							/>
						</div>
						<div className="flex space-x-3">
							<button
								onClick={() => {
									setShowCloseModal(false);
									setCloseReason('');
								}}
								className="flex-1 btn-outline"
							>
								Cancel
							</button>
							<button
								onClick={handleCloseTicket}
								disabled={!closeReason.trim()}
								className="flex-1 btn-primary"
							>
								Close Ticket
							</button>
						</div>
					</motion.div>
				</div>
			)}
		</div>
	);
};

export default SupportTicketsManager;

