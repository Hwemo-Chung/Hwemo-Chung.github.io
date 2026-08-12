const siteTranslations = {
    ko: {
        nav: {
            home: "홈",
            sales: "서비스",
            offers: "상품",
            diagnosis: "진단",
            retainer: "유지보수",
            threads: "스레드",
            about: "소개",
            projects: "프로젝트",
            contact: "연락처",
            colorpicker: "색상 선택기",
            ads: "광고",
            privacy: "개인정보처리방침"
        },
        common: {
            skip: "본문으로",
            mainNav: "메인",
            footerNav: "푸터",
            language: "언어 선택",
            quickContact: "빠른 문의",
            quickNavigation: "빠른 이동",
            scrollTable: "가로로 스크롤 →",
            disclaimer: "독립 계약 서비스이며 어떠한 고용주와도 제휴하지 않습니다."
        },
        aria: {
            sampleReport: "샘플 리포트 요약",
            dropCsv: "events.csv 파일 놓기",
            filters: "필터",
            summary: "요약",
            budgetProgress: "예산 진행률",
            eventsTable: "이벤트 표"
        },
        footer: {
            privacy: "개인정보처리방침"
        },
        error404: {
            message: "요청하신 페이지를 찾을 수 없습니다.",
            home: "홈으로 돌아가기"
        },
        hero: {
            tagline: "어둠의 한 줄기 빛이 되는 소프트웨어를 개발합니다",
            cta: "프로젝트 보기"
        },
        about: {
            title: "About Me",
            description: "개발자로서 사용자에게 도움이 되는 서비스를 만들고 있습니다.",
            skills: "기술 스택"
        },
        projects: {
            title: "Projects",
            viewGithub: "GitHub에서 보기 →"
        },
        contact: {
            title: "Contact",
            description: "함께 빛을 만들어갈 기회를 찾고 있습니다"
        }
    },
    en: {
        nav: {
            home: "Home",
            sales: "サービス",
            offers: "商品",
            diagnosis: "Diagnosis",
            retainer: "保守",
            threads: "スレッド",
            about: "About",
            projects: "Projects",
            contact: "Contact",
            colorpicker: "Color Picker",
            ads: "Ads",
            privacy: "Privacy Policy"
        },
        common: {
            skip: "Skip to content",
            mainNav: "Main navigation",
            footerNav: "Footer navigation",
            language: "Language selection",
            quickContact: "Quick contact",
            quickNavigation: "Quick navigation",
            scrollTable: "Scroll horizontally →",
            disclaimer: "Independent contractor offer. Not affiliated with any employer."
        },
        aria: {
            sampleReport: "Sample report summary",
            dropCsv: "Drop events.csv here",
            filters: "Filters",
            summary: "Summary",
            budgetProgress: "Budget progress",
            eventsTable: "Events table"
        },
        footer: {
            privacy: "Privacy"
        },
        error404: {
            message: "The page you requested could not be found.",
            home: "Return home"
        },
        hero: {
            tagline: "Building software that brings light to darkness",
            cta: "View Projects"
        },
        about: {
            title: "About Me",
            description: "As a developer, I create services that help users.",
            skills: "Tech Stack"
        },
        projects: {
            title: "Projects",
            viewGithub: "View on GitHub →"
        },
        contact: {
            title: "Contact",
            description: "Looking for opportunities to create light together"
        }
    },
    ja: {
        nav: {
            home: "ホーム",
            sales: "サービス",
            offers: "商品",
            diagnosis: "診断",
            retainer: "保守",
            threads: "スレッド",
            about: "紹介",
            projects: "プロジェクト",
            contact: "連絡先",
            colorpicker: "カラーピッカー",
            ads: "広告",
            privacy: "プライバシーポリシー"
        },
        common: {
            skip: "本文へ移動",
            mainNav: "メインナビゲーション",
            footerNav: "フッターナビゲーション",
            language: "言語選択",
            quickContact: "クイックお問い合わせ",
            quickNavigation: "クイックナビゲーション",
            scrollTable: "横にスクロール →",
            disclaimer: "独立請負サービスであり、いかなる雇用主とも提携していません。"
        },
        aria: {
            sampleReport: "サンプルレポートの概要",
            dropCsv: "events.csv をここにドロップ",
            filters: "フィルター",
            summary: "概要",
            budgetProgress: "予算の進捗",
            eventsTable: "イベント表"
        },
        footer: {
            privacy: "プライバシー"
        },
        error404: {
            message: "お探しのページが見つかりませんでした。",
            home: "ホームに戻る"
        },
        hero: {
            tagline: "闇に一筋の光をもたらすソフトウェアを開発します",
            cta: "プロジェクトを見る"
        },
        about: {
            title: "About Me",
            description: "開発者として、ユーザーに役立つサービスを作っています。",
            skills: "技術スタック"
        },
        projects: {
            title: "Projects",
            viewGithub: "GitHubで見る →"
        },
        contact: {
            title: "Contact",
            description: "一緒に光を作り出す機会を探しています"
        }
    }
};

let siteCurrentLang = localStorage.getItem('language') || 'ko';

function setSiteLanguage(lang) {
    siteCurrentLang = siteTranslations[lang] ? lang : 'ko';
    localStorage.setItem('language', siteCurrentLang);
    document.documentElement.style.setProperty('--ls-scroll-hint', `"${siteTranslations[siteCurrentLang].common.scrollTable}"`);
    
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const keys = key.split('.');
        let translation = siteTranslations[siteCurrentLang];
        
        for (const k of keys) {
            translation = translation?.[k];
        }
        
        if (translation) {
            element.textContent = translation;
        }
    });

    document.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
        const keys = element.getAttribute('data-i18n-aria-label').split('.');
        let translation = siteTranslations[siteCurrentLang];
        for (const key of keys) translation = translation?.[key];
        if (translation) element.setAttribute('aria-label', translation);
    });
    
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-lang') === siteCurrentLang) {
            btn.classList.add('active');
        }
    });
    
    document.documentElement.lang = siteCurrentLang;
    document.documentElement.dataset.siteLang = siteCurrentLang;
}

document.addEventListener('DOMContentLoaded', () => {
    if (!document.querySelector('.language-toolbar')) {
        const toolbar = document.createElement('div');
        const selector = document.createElement('div');
        toolbar.className = 'language-toolbar';
        toolbar.dataset.i18nAriaLabel = 'common.language';
        selector.className = 'language-selector';
        for (const [lang, label] of [['ko', '한'], ['en', 'EN'], ['ja', '日']]) {
            const button = document.createElement('button');
            button.className = 'lang-btn';
            button.type = 'button';
            button.dataset.lang = lang;
            button.textContent = label;
            selector.append(button);
        }
        toolbar.append(selector);
        document.querySelector('.ls-nav')?.after(toolbar);
    }

    setSiteLanguage(siteCurrentLang);
    
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const lang = btn.getAttribute('data-lang');
            setSiteLanguage(lang);
        });
    });
});

window.siteTranslations = siteTranslations;
window.setSiteLanguage = setSiteLanguage;
