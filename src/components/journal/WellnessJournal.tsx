import React, { useState } from 'react';
import { JOURNAL_ARTICLES } from '../../data/siteContent';
import { ArrowRight, BookOpen, X, Clock } from 'lucide-react';

export const WellnessJournal: React.FC = () => {
  const [activeArticle, setActiveArticle] = useState<(typeof JOURNAL_ARTICLES)[0] | null>(null);

  return (
    <section id="the-journal" className="py-16 md:py-24 bg-[#F2ECE1]/50 border-b border-[#E5DCCE]/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10 pb-6 border-b border-[#E5DCCE]">
          <div>
            <span className="text-xs uppercase tracking-widest text-[#9E6D47] font-semibold flex items-center gap-1.5 mb-1.5">
              <BookOpen className="w-3.5 h-3.5 text-[#D18D4D]" />
              The Journal
            </span>
            <h2 className="text-3xl sm:text-4xl font-serif text-[#1F1B18] tracking-tight">
              Stories, rituals, and inspiration for a calmer life.
            </h2>
          </div>
        </div>

        {/* Article Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {JOURNAL_ARTICLES.map((article) => (
            <article
              key={article.id}
              onClick={() => setActiveArticle(article)}
              className="bg-[#FAF7F2] p-6 rounded-2xl border border-[#E5DCCE] hover:border-[#D18D4D]/60 hover:shadow-md transition-all duration-300 flex flex-col justify-between cursor-pointer group"
            >
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] text-[#79716B]">
                  <span className="font-semibold text-[#9E6D47] uppercase tracking-wider">
                    {article.category}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{article.readTime}</span>
                </div>

                <h3 className="text-xl font-serif font-bold text-[#1F1B18] group-hover:text-[#9E6D47] transition-colors leading-snug">
                  {article.title}
                </h3>

                <p className="text-xs text-[#65412E] leading-relaxed line-clamp-3">
                  {article.excerpt}
                </p>
              </div>

              <div className="pt-4 mt-4 border-t border-[#E5DCCE]/70 flex items-center justify-between text-xs text-[#1F1B18] font-medium group-hover:text-[#9E6D47] transition-colors">
                <span>Read Article</span>
                <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Reader Modal */}
      {activeArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-[#FAF7F2] border border-[#E5DCCE] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
            <div className="px-6 py-4 border-b border-[#E5DCCE] flex items-center justify-between bg-[#F2ECE1]/60">
              <div className="flex items-center gap-2 text-xs text-[#79716B]">
                <span className="font-semibold text-[#9E6D47] uppercase tracking-wider">{activeArticle.category}</span>
                <span>·</span>
                <span>{activeArticle.readTime}</span>
              </div>
              <button
                onClick={() => setActiveArticle(null)}
                className="p-1.5 text-stone-500 hover:text-stone-900 rounded-full hover:bg-stone-200/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 sm:p-8 overflow-y-auto space-y-6">
              <div className="space-y-2">
                <span className="text-[11px] uppercase tracking-widest text-[#79716B]">Published {activeArticle.date}</span>
                <h3 className="text-2xl sm:text-3xl font-serif font-bold text-[#1F1B18]">
                  {activeArticle.title}
                </h3>
              </div>

              <div className="prose prose-stone text-xs sm:text-sm text-[#4A2F22] leading-relaxed space-y-4 whitespace-pre-line font-normal">
                {activeArticle.content}
              </div>

              <div className="pt-4 border-t border-[#E5DCCE] text-center">
                <button
                  onClick={() => setActiveArticle(null)}
                  className="px-6 py-2.5 bg-[#2A2521] text-white text-xs font-medium rounded-full hover:bg-[#4A2F22] transition-colors"
                >
                  Close Article
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
