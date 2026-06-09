import configparser
import os
import sys

import pymysql

APP_DIR = os.environ.get("SEER_APP_DIR") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

from account_data import format_ini_display_name, get_latest_user_ini
from settings import ITEMS_TXT_PATH, get_db_name, get_mysql_config, refresh_exports
from stdio_utf8 import setup as setup_stdio

setup_stdio()
refresh_exports()

USER_DIR = os.path.join(os.path.dirname(APP_DIR), "重聚", "seer_cfg", "user")
MYSQL_CONFIG = get_mysql_config()
DB_NAME = get_db_name()
TABLE_NAME = "raw_items_data"


def parse_item_section(ini_path):
    config = configparser.ConfigParser()
    config.optionxform = str

    try:
        config.read(ini_path, encoding="gbk")
    except Exception:
        config.read(ini_path, encoding="gb2312")

    lines = []
    pairs = []
    if "道具" in config:
        for item_id, item_count in config["道具"].items():
            lines.append(f"{item_id}={item_count}")
            try:
                pairs.append((int(item_id), int(item_count)))
            except ValueError:
                print(f"[警告] 无效数据行：{item_id}={item_count}（非数字格式）")
    return lines, pairs


def write_raw_txt(lines, txt_path):
    os.makedirs(os.path.dirname(txt_path), exist_ok=True)
    with open(txt_path, "w", encoding="utf-8") as file:
        file.write("\n".join(lines))
    print(f"[成功] 已写入 {len(lines)} 行到 {txt_path}")


def overwrite_mysql_table(pairs):
    conn = pymysql.connect(**MYSQL_CONFIG)
    cursor = conn.cursor()
    cursor.execute(f"USE `{DB_NAME}`")
    print(f"[成功] 已切换到数据库：{DB_NAME}")

    create_sql = f"""
    CREATE TABLE IF NOT EXISTS `{TABLE_NAME}` (
        `item_id` INT COMMENT '道具编号',
        `quantity` INT COMMENT '道具数量',
        PRIMARY KEY (`item_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='道具原始数据';
    """
    cursor.execute(create_sql)
    print(f"[成功] 表 {TABLE_NAME} 已确保存在")
    cursor.execute(f"TRUNCATE TABLE `{TABLE_NAME}`")

    if pairs:
        insert_sql = f"INSERT INTO `{TABLE_NAME}`(`item_id`, `quantity`) VALUES (%s, %s)"
        cursor.executemany(insert_sql, pairs)
        conn.commit()
        print(f"[成功] 数据库 {TABLE_NAME} 已覆盖导入 {len(pairs)} 条记录")
    else:
        print("[信息] 无有效道具数据可插入")

    cursor.close()
    conn.close()


def main():
    ini_path = get_latest_user_ini(USER_DIR)
    if not ini_path:
        print("[失败] 未找到用户INI文件")
        return False

    print(f"[成功] 读取文件: {format_ini_display_name(os.path.basename(ini_path))}")
    lines, pairs = parse_item_section(ini_path)

    if not lines:
        print("[失败] [道具] 段为空或不存在")
        return False

    write_raw_txt(lines, ITEMS_TXT_PATH)
    overwrite_mysql_table(pairs)
    print("\n[完成] 道具数据处理全部完成！")
    return True


if __name__ == "__main__":
    main()
