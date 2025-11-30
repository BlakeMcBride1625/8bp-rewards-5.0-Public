import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { 
	MessageCircle, 
	Send, 
	ChevronDown, 
	Clock, 
	CheckCircle, 
	XCircle,
	AlertCircle,
	Loader
} from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';
import { useAuth } from '../hooks/useAuth';
import { useTicketMessages } from '../hooks/useWebSocket';

interface Ticket {
	id: string;
	ticket_number: string;
	status: 'open' | 'closed';
	category: string;
	subject: string;
	created_at: string;
	closed_at?: string;
	close_reason?: string;
}

interface Message {
	id: string;
	sender_type: 'user' | 'admin' | 'system';
	sender_discord_id?: string;
	message: string;
	created_at: string;
}

const SUPPORT_CATEGORIES = [
	'Claiming issue',
	'Deregistration request',
	'ID request',
	'General account issue',
	'Payment/credit issue',
	'Other'
];

const SupportChat: React.FC = () => {
	const { user } = useAuth();
	const [tickets, setTickets] = useState<Ticket[]>([]);
	const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
	const [messages, setMessages] = useState<Message[]>([]);
	const [messageInput, setMessageInput] = useState('');
	const [isLoading, setIsLoading] = useState(true);
	const [isCreatingTicket, setIsCreatingTicket] = useState(false);
	const [selectedCategory, setSelectedCategory] = useState<string>('');
	const [showCategorySelect, setShowCategorySelect] = useState(false);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const [isSending, setIsSending] = useState(false);

	useEffect(() => {
		fetchTickets();
	}, []);

	// WebSocket for real-time updates
	const { newMessage: wsNewMessage, consumeNewMessage } = useTicketMessages(selectedTicket?.id || null);

	useEffect(() => {
		if (selectedTicket) {
			fetchMessages(selectedTicket.id);
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
			const response = await axios.get(API_ENDPOINTS.USER_SUPPORT_TICKETS, {
				withCredentials: true
			});
			setTickets(response.data.tickets || []);
			
			// Auto-select first open ticket or most recent
			if (response.data.tickets && response.data.tickets.length > 0) {
				const openTicket = response.data.tickets.find((t: Ticket) => t.status === 'open');
				setSelectedTicket(openTicket || response.data.tickets[0]);
			}
		} catch (error) {
			console.error('Failed to fetch tickets:', error);
			toast.error('Failed to load support tickets');
		} finally {
			setIsLoading(false);
		}
	};

	const fetchMessages = async (ticketId: string) => {
		try {
			const response = await axios.get(
				API_ENDPOINTS.USER_SUPPORT_TICKET_MESSAGES(ticketId),
				{ withCredentials: true }
			);
			setMessages(response.data.messages || []);
		} catch (error) {
			console.error('Failed to fetch messages:', error);
		}
	};

	const createTicket = async (category: string) => {
		try {
			setIsCreatingTicket(true);
			const response = await axios.post(
				API_ENDPOINTS.USER_SUPPORT_CREATE,
				{ category },
				{ withCredentials: true }
			);
			
			const newTicket = response.data.ticket;
			setTickets([newTicket, ...tickets]);
			setSelectedTicket(newTicket);
			setShowCategorySelect(false);
			setSelectedCategory('');
			toast.success(`Ticket ${newTicket.ticket_number} created successfully`);
		} catch (error: any) {
			console.error('Failed to create ticket:', error);
			toast.error(error.response?.data?.error || 'Failed to create ticket');
		} finally {
			setIsCreatingTicket(false);
		}
	};

	const sendMessage = async () => {
		if (!selectedTicket || !messageInput.trim() || selectedTicket.status === 'closed') {
			return;
		}

		try {
			setIsSending(true);
			await axios.post(
				API_ENDPOINTS.USER_SUPPORT_TICKET_MESSAGES(selectedTicket.id),
				{ message: messageInput.trim() },
				{ withCredentials: true }
			);
			
			setMessageInput('');
			// Refresh messages
			await fetchMessages(selectedTicket.id);
		} catch (error: any) {
			console.error('Failed to send message:', error);
			toast.error(error.response?.data?.error || 'Failed to send message');
		} finally {
			setIsSending(false);
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

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<Loader className="w-8 h-8 animate-spin text-primary-500" />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Category Selection / New Ticket */}
			{showCategorySelect && (
				<motion.div
					initial={{ opacity: 0, y: -10 }}
					animate={{ opacity: 1, y: 0 }}
					className="card"
				>
					<h3 className="text-lg font-semibold text-text-primary mb-4">
						Select Issue Category
					</h3>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
						{SUPPORT_CATEGORIES.map((category) => (
							<button
								key={category}
								onClick={() => createTicket(category)}
								disabled={isCreatingTicket}
								className="p-3 text-left border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
							>
								{category}
							</button>
						))}
					</div>
					<button
						onClick={() => {
							setShowCategorySelect(false);
							setSelectedCategory('');
						}}
						className="mt-4 text-sm text-text-secondary hover:text-text-primary"
					>
						Cancel
					</button>
				</motion.div>
			)}

			{/* Tickets List */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Tickets Sidebar */}
				<div className="lg:col-span-1">
					<div className="card">
						<div className="flex items-center justify-between mb-4">
							<h3 className="text-lg font-semibold text-text-primary">
								Your Tickets
							</h3>
							<button
								onClick={() => setShowCategorySelect(true)}
								className="btn-primary text-sm px-3 py-1.5"
								disabled={showCategorySelect}
							>
								+ New
							</button>
						</div>

						{tickets.length === 0 ? (
							<div className="text-center py-8">
								<MessageCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
								<p className="text-text-secondary text-sm">
									No tickets yet. Create one to get started!
								</p>
							</div>
						) : (
							<div className="space-y-2">
								{tickets.map((ticket) => (
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
											{ticket.category || 'No category'}
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

				{/* Chat Interface */}
				<div className="lg:col-span-2">
					{selectedTicket ? (
						<div className="card flex flex-col h-[600px]">
							{/* Chat Header */}
							<div className="border-b border-gray-200 dark:border-white/10 pb-4 mb-4">
								<div className="flex items-center justify-between">
									<div>
										<h3 className="text-lg font-semibold text-text-primary">
											{selectedTicket.ticket_number}
										</h3>
										<p className="text-sm text-text-secondary">
											{selectedTicket.category} • {formatDate(selectedTicket.created_at)}
										</p>
									</div>
									{selectedTicket.status === 'closed' && (
										<div className="flex items-center space-x-2 text-sm text-gray-500">
											<XCircle className="w-4 h-4" />
											<span>Closed</span>
										</div>
									)}
								</div>
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

							{/* Messages */}
							<div className="flex-1 overflow-y-auto space-y-4 mb-4">
								{messages.length === 0 ? (
									<div className="text-center py-8 text-text-secondary">
										<MessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
										<p>No messages yet. Start the conversation!</p>
									</div>
								) : (
									messages.map((msg) => (
										<div
											key={msg.id}
											className={`flex ${
												msg.sender_type === 'user' ? 'justify-end' : 'justify-start'
											}`}
										>
											<div
												className={`max-w-[80%] rounded-lg p-3 ${
													msg.sender_type === 'user'
														? 'bg-primary-500 text-white'
														: msg.sender_type === 'admin'
														? 'bg-blue-500 text-white'
														: 'bg-gray-100 dark:bg-white/5 text-text-secondary'
												}`}
											>
												<p className="text-sm whitespace-pre-wrap">{msg.message}</p>
												<p
													className={`text-xs mt-1 ${
														msg.sender_type === 'user' || msg.sender_type === 'admin'
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
						<div className="card flex items-center justify-center h-[600px]">
							<div className="text-center">
								<MessageCircle className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
								<p className="text-text-secondary">
									{showCategorySelect
										? 'Select a category to create a new ticket'
										: 'Select a ticket to view messages or create a new one'}
								</p>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default SupportChat;

