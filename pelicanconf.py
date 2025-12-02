# 主题设置
THEME = 'themes/subtle'

AUTHOR = 'nooae'
SITENAME = "Nooae's blog"
SITEURL = ""

PATH = "content"

TIMEZONE = 'Asia/Shanghai'

DEFAULT_LANG = 'Chinese (Simplified)'

# Feed generation is usually not desired when developing
FEED_ALL_ATOM = None
CATEGORY_FEED_ATOM = None
TRANSLATION_FEED_ATOM = None
AUTHOR_FEED_ATOM = None
AUTHOR_FEED_RSS = None

# 自定义菜单项（显示在最前面）
MENUITEMS = [
    ('🏠 首页', '/'),
    ('📚 归档', '/archives.html'),
    ('📂 分类', '/categories.html'),
    ('🏷️ 标签', '/tags.html'),
    ('📖 系列', '/series.html'),
]

# Blogroll
LINKS = (
    ("Pelican", "https://getpelican.com/"),
    ("Python.org", "https://www.python.org/"),
    ("Jinja2", "https://palletsprojects.com/p/jinja/"),
    ("You can modify those links in your config file", "#"),
)

# Social widget
SOCIAL = (
    ("You can add links in your config file", "#"),
    ("Another social link", "#"),
)

DEFAULT_PAGINATION = False

# Uncomment following line if you want document-relative URLs when developing
# RELATIVE_URLS = True
