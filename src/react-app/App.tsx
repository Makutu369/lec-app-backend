import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
	Book,
	Lock,
	PlayCircle,
	MapPin,
	Copy,
	Check,
	Terminal,
	Activity,
	ArrowRight,
	ExternalLink,
	Command,
	Search
} from "lucide-react";
import "./index.css";

interface Endpoint {
	id: string;
	method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
	path: string;
	auth: boolean;
	description: string;
	category: string;
	payload?: any;
	response?: any;
}

const endpoints: Endpoint[] = [
	{
		id: "health",
		method: "GET",
		path: "/api/",
		auth: false,
		description: "System health check and version status.",
		category: "Core",
		response: { name: "LEC App Backend", status: "ok", timestamp: "..." }
	},
	{
		id: "signin",
		method: "POST",
		path: "/api/auth/signin",
		auth: false,
		description: "Authenticate user and issue JWT bearer token.",
		category: "Auth",
		payload: { email: "user@example.com", password: "password123" },
		response: { token: "eyJhbG...", user: { id: "...", email: "...", role: "student" } }
	},
	{
		id: "signup",
		method: "POST",
		path: "/api/auth/signup",
		auth: false,
		description: "Create a new student or pastor account.",
		category: "Auth",
		payload: {
			firstName: "John",
			lastName: "Doe",
			email: "john@example.com",
			password: "password123",
			confirmPassword: "password123",
			megaCenterId: "uuid",
			userLocation: "City, Country"
		}
	},
	{
		id: "courses-list",
		method: "GET",
		path: "/api/courses",
		auth: false,
		description: "Fetch all courses with their respective modules.",
		category: "Learning",
		response: [{ id: "...", title: "Course 1", sections: [] }]
	},
	{
		id: "enroll",
		method: "POST",
		path: "/api/courses/:courseId/enroll",
		auth: true,
		description: "Enroll current user into a specific course path.",
		category: "Learning"
	},
	{
		id: "progress",
		method: "GET",
		path: "/api/courses/:courseId/progress",
		auth: true,
		description: "Retrieve real-time user progress for a course.",
		category: "Learning"
	},
	{
		id: "complete-section",
		method: "PATCH",
		path: "/api/sections/:sectionId/complete",
		auth: true,
		description: "Update completion state for a course module.",
		category: "Sections"
	},
	{
		id: "mega-centers",
		method: "GET",
		path: "/api/mega-centers",
		auth: false,
		description: "Get directory of all church mega centers.",
		category: "Data"
	}
];

const categories = Array.from(new Set(endpoints.map(e => e.category)));

function App() {
	const [activeTab, setActiveTab] = useState("Core");
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");

	const copyToClipboard = (text: string, id: string) => {
		navigator.clipboard.writeText(text);
		setCopiedId(id);
		setTimeout(() => setCopiedId(null), 2000);
	};

	const getMethodBadge = (method: string) => {
		switch (method) {
			case 'GET': return 'bg-white/10 text-white';
			case 'POST': return 'bg-white/20 text-white';
			case 'PATCH': return 'bg-white/30 text-white';
			default: return 'bg-white/5 text-gray-400';
		}
	};

	const filteredEndpoints = endpoints.filter(e =>
		e.category === activeTab &&
		(e.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
			e.description.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	return (
		<div className="min-h-screen bg-black text-white selection:bg-white selection:text-black font-sans">
			{/* Top Nav */}
			<nav className="fixed top-0 left-0 right-0 h-20 border-b border-white/10 bg-black/80 backdrop-blur-xl z-50 px-8 flex items-center justify-between">
				<div className="flex items-center gap-10">
					<div className="flex items-center gap-2 group cursor-pointer">
						<div className="w-9 h-9 bg-white text-black rounded-lg flex items-center justify-center font-black text-xl transition-transform group-hover:rotate-12">
							L
						</div>
						<span className="text-xl font-bold tracking-tighter">LEC.CORE</span>
					</div>

					<div className="hidden lg:flex items-center gap-6">
						<a href="#" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Documentation</a>
						<a href="#" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Guides</a>
						<a href="#" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Support</a>
					</div>
				</div>

				<div className="flex items-center gap-4">
					<div className="relative hidden md:block">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
						<input
							type="text"
							placeholder="Search API..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="bg-white/5 border border-white/10 rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-white/30 w-64 transition-all"
						/>
					</div>
					<button className="p-2.5 rounded-full hover:bg-white/10 transition-colors">
					</button>
					<button className="btn-primary">
						Deploy
					</button>
				</div>
			</nav>

			<div className="flex pt-20 h-screen overflow-hidden">
				{/* Sidebar */}
				<aside className="w-80 border-r border-white/10 p-8 flex flex-col gap-10 overflow-y-auto">
					<div>
						<h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-6">Endpoint Categories</h3>
						<div className="space-y-1">
							{categories.map(cat => (
								<button
									key={cat}
									onClick={() => setActiveTab(cat)}
									className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-semibold transition-all group ${activeTab === cat
										? 'bg-white text-black'
										: 'text-gray-400 hover:text-white hover:bg-white/5'
										}`}
								>
									{cat === 'Core' && <Activity size={18} />}
									{cat === 'Auth' && <Lock size={18} />}
									{cat === 'Learning' && <Book size={18} />}
									{cat === 'Sections' && <PlayCircle size={18} />}
									{cat === 'Data' && <MapPin size={18} />}
									<span>{cat}</span>
									{activeTab !== cat && (
										<ArrowRight size={14} className="ml-auto opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
									)}
								</button>
							))}
						</div>
					</div>

					<div className="mt-auto">
						<div className="p-5 rounded-2xl border border-white/10 bg-white/5 space-y-4">
							<div className="flex items-center gap-3">
								<Command size={20} className="text-gray-400" />
								<span className="text-xs font-bold text-gray-400">Quick Switch</span>
							</div>
							<p className="text-[11px] text-gray-500 leading-relaxed">
								Use <kbd className="bg-white/10 px-1.5 py-0.5 rounded border border-white/20 text-white">⌘</kbd> + <kbd className="bg-white/10 px-1.5 py-0.5 rounded border border-white/20 text-white">K</kbd> to search anywhere.
							</p>
						</div>
					</div>
				</aside>

				{/* Content */}
				<main className="flex-1 overflow-y-auto p-12 lg:p-20 scroll-smooth">
					<div className="max-w-4xl">
						<header className="mb-20">
							<motion.div
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.6 }}
							>
								<h1 className="text-7xl font-extrabold mb-8 leading-[1.1] tracking-tighter">
									API <span className="text-gray-600">Reference.</span>
								</h1>
								<p className="text-2xl text-gray-400 font-medium leading-relaxed max-w-2xl">
									Build faster with the LEC platform's core infrastructure. High-performance, serverless, and ready for production.
								</p>
							</motion.div>
						</header>

						<AnimatePresence mode="wait">
							<motion.div
								key={activeTab}
								initial={{ opacity: 0, x: 20 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: -20 }}
								transition={{ duration: 0.4 }}
								className="space-y-32 pb-40"
							>
								{filteredEndpoints.length > 0 ? (
									filteredEndpoints.map((endpoint) => (
										<section key={endpoint.id} className="group">
											<div className="flex flex-col gap-12">
												<div className="space-y-8">
													<div className="flex items-center gap-4">
														<span className={`px-3 py-1 rounded-md text-xs font-black uppercase tracking-widest ${getMethodBadge(endpoint.method)}`}>
															{endpoint.method}
														</span>
														<code className="text-xl font-mono font-bold text-white tracking-tight">
															{endpoint.path}
														</code>
														{endpoint.auth && (
															<div className="flex items-center gap-2 text-[10px] font-black text-gray-500 bg-white/5 border border-white/10 px-2.5 py-1 rounded-md uppercase tracking-tighter">
																<Lock size={12} />
																Auth Required
															</div>
														)}
													</div>

													<div className="space-y-4">
														<h2 className="text-4xl font-bold text-white group-hover:translate-x-2 transition-transform duration-500">
															{endpoint.description}
														</h2>
														<p className="text-lg text-gray-500 leading-relaxed max-w-2xl">
															Manage {endpoint.description.toLowerCase().replace('.', '')} with this high-level API call.
															Optimized for low latency and consistent schema validation.
														</p>
													</div>
												</div>

												<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
													{/* Code Example */}
													<div className="code-block group/code">
														<div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-white/5">
															<div className="flex gap-1.5">
																<div className="w-2.5 h-2.5 rounded-full bg-white/10" />
																<div className="w-2.5 h-2.5 rounded-full bg-white/10" />
																<div className="w-2.5 h-2.5 rounded-full bg-white/10" />
															</div>
															<button
																onClick={() => copyToClipboard(`curl -X ${endpoint.method} https://api.lec.com${endpoint.path}`, endpoint.id)}
																className="text-gray-500 hover:text-white transition-colors"
															>
																{copiedId === endpoint.id ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
															</button>
														</div>
														<div className="p-8 font-mono text-[13px] leading-relaxed text-gray-400 overflow-x-auto selection:bg-white selection:text-black">
															<span className="text-gray-600 mb-4 block"># Example Request</span>
															<div className="flex gap-3">
																<span className="text-white">curl</span>
																<span>-X {endpoint.method} \</span>
															</div>
															<div className="pl-8 text-white">"https://api.lec.com{endpoint.path}" \</div>
															{endpoint.payload && (
																<div className="pl-8">
																	<span className="text-gray-400">-d '{JSON.stringify(endpoint.payload, null, 2)}'</span>
																</div>
															)}
															{endpoint.auth && (
																<div className="pl-8">
																	<span className="text-gray-400">-H "Authorization: Bearer <span className="text-white">JWT_TOKEN</span>"</span>
																</div>
															)}
														</div>
													</div>

													{/* Parameters / Info */}
													<div className="p-8 rounded-2xl border border-white/10 bg-white/5 space-y-8">
														<div className="space-y-4">
															<h5 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Parameters</h5>
															{endpoint.payload ? (
																<div className="space-y-3">
																	{Object.keys(endpoint.payload).map(key => (
																		<div key={key} className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
																			<span className="font-mono text-white">{key}</span>
																			<span className="text-gray-600 italic">string</span>
																		</div>
																	))}
																</div>
															) : (
																<p className="text-sm text-gray-600">No parameters required.</p>
															)}
														</div>

														<div className="pt-4 flex items-center gap-3 text-sm text-gray-400">
															<Activity size={16} />
															<span>Average Response Time: <span className="text-white">~45ms</span></span>
														</div>
													</div>
												</div>
											</div>
										</section>
									))
								) : (
									<div className="py-20 text-center space-y-6">
										<div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto text-gray-500 border border-white/10">
											<Search size={32} />
										</div>
										<div>
											<h3 className="text-xl font-bold">No endpoints found</h3>
											<p className="text-gray-500">Try searching for something else.</p>
										</div>
									</div>
								)}
							</motion.div>
						</AnimatePresence>
					</div>
				</main>
			</div>
		</div>
	);
}

export default App;
