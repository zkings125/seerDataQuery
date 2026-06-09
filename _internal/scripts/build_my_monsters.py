import sys

import pymysql

APP_DIR = __import__("os").environ.get("SEER_APP_DIR") or __import__("os").path.dirname(
    __import__("os").path.dirname(__import__("os").path.abspath(__file__))
)
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

from settings import get_db_name, get_mysql_config, refresh_exports
from stdio_utf8 import setup as setup_stdio

setup_stdio()
refresh_exports()

MYSQL_CONFIG = get_mysql_config()
DB_NAME = get_db_name()


def build_my_monsters():
    print("\n正在生成我的精灵表 my_monsters...")
    conn = pymysql.connect(**MYSQL_CONFIG)
    cursor = conn.cursor()
    cursor.execute(f"USE `{DB_NAME}`")
    cursor.execute("DROP TABLE IF EXISTS my_monsters;")

    create_sql = """
    CREATE TABLE my_monsters AS
    SELECT
        r.monster_id AS id,
        m.defname AS defname,
        COUNT(r.monster_id) AS quantity
    FROM raw_elf_data r
    LEFT JOIN monsters m ON r.monster_id = m.id
    GROUP BY r.monster_id, m.defname
    ORDER BY r.monster_id ASC;
    """
    cursor.execute(create_sql)
    cursor.execute("DELETE FROM my_monsters WHERE id > 5000 OR id < 1;")
    conn.commit()
    cursor.close()
    conn.close()
    print("[成功] my_monsters 生成完成！")
    return True


def main():
    try:
        return build_my_monsters()
    except Exception as exc:
        print(f"[失败] 错误：{exc}")
        return False


if __name__ == "__main__":
    main()
