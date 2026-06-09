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


def build_my_items():
    print("\n正在生成我的道具表 my_items...")
    conn = pymysql.connect(**MYSQL_CONFIG)
    cursor = conn.cursor()
    cursor.execute(f"USE `{DB_NAME}`")
    cursor.execute("DROP TABLE IF EXISTS my_items;")

    create_sql = """
    CREATE TABLE my_items AS
    SELECT
        r.item_id AS item_id,
        i.name AS name,
        r.quantity AS quantity
    FROM raw_items_data r
    LEFT JOIN items i ON r.item_id = i.id
    ORDER BY r.item_id ASC;
    """
    cursor.execute(create_sql)
    conn.commit()
    cursor.close()
    conn.close()
    print("[成功] my_items 生成完成！")
    return True


def main():
    try:
        return build_my_items()
    except Exception as exc:
        print(f"[失败] 错误：{exc}")
        return False


if __name__ == "__main__":
    main()
