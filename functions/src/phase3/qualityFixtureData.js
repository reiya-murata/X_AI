// AUTO-GENERATED FILE. DO NOT EDIT BY HAND.
// Source of truth: /Users/reiya/Projects/X_AI/src/qualityFixtureData.js
const data = {
  "version": "1.0.0",
  "humanEvaluationTags": {
    "good": [
      "元投稿への理解が深い",
      "一段深い補足がある",
      "れいや固有の経験が自然",
      "短く読みやすい",
      "宣伝臭がない",
      "相手が返信しやすい",
      "プロフィールを見たくなる",
      "人間味がある",
      "専門性が自然に伝わる"
    ],
    "bad": [
      "一般論すぎる",
      "元投稿の言い換えだけ",
      "共感だけで終わっている",
      "文脈を読み違えている",
      "関係ないAI接続",
      "宣伝臭が強い",
      "自己紹介が不自然",
      "上から目線",
      "説教臭い",
      "長すぎる",
      "同じ構文の反復",
      "れいや固有性がない",
      "根拠のない断定",
      "相手より自分の話が中心",
      "Xの返信として重い",
      "不自然なプロフィール誘導"
    ]
  },
  "qualityFixtures": [
    {
      "id": "fixture-ai-workflow-001",
      "category": "ai_workflow",
      "sourcePost": "AIツールを入れても、結局だれが更新するか決まってないと止まる。",
      "authorContext": {
        "relationshipLevel": "unknown",
        "isTargetAudience": true
      },
      "expectedReplyStrategy": [
        "自然な共感",
        "元投稿の言い換えで終わらない",
        "現場実装の視点を一段追加"
      ],
      "allowedIdentityAngles": [
        "AI業務改善",
        "Web制作からAIツール開発へ移った経験"
      ],
      "avoidIdentityAngles": [
        "関係のないMEO運用AIの宣伝"
      ],
      "mustAvoid": [
        "元投稿の要約だけ",
        "直接的なプロフィール誘導",
        "過剰な営業CTA"
      ],
      "expectedClaimLevel": "low",
      "notes": "更新フローの詰まりに寄せる。",
      "mockReplies": [
        {
          "id": "A",
          "text": "それ、かなり本質だと思います。AIそのものより、誰が更新して改善に戻すかまで決めて初めて回りやすいですよね。"
        },
        {
          "id": "B",
          "text": "自動化の前に更新フローを決めるの大事ですよね。現場だと、そこが曖昧なままだとすぐ止まりやすいです。"
        },
        {
          "id": "C",
          "text": "AIは入れた瞬間より、運用の回し方で差が出ますよね。更新担当と例外処理を先に決めておくのが効きます。"
        }
      ]
    },
    {
      "id": "fixture-web-ai-002",
      "category": "web_ai",
      "sourcePost": "Web制作もAIでかなり変わるけど、見た目より運用が先に詰まりそう。",
      "authorContext": {
        "relationshipLevel": "unknown",
        "isTargetAudience": true
      },
      "expectedReplyStrategy": [
        "自然な共感",
        "現場実装の視点を一段追加"
      ],
      "allowedIdentityAngles": [
        "Web制作からAIツール開発へ移った経験",
        "AI業務改善"
      ],
      "avoidIdentityAngles": [
        "MEO運用アシスタントの宣伝"
      ],
      "mustAvoid": [
        "元投稿の要約だけ",
        "過剰な営業CTA"
      ],
      "expectedClaimLevel": "low",
      "notes": "更新導線や運用設計へ接続。",
      "mockReplies": [
        {
          "id": "A",
          "text": "Web制作って、作る速さより更新の回し方で差が出やすいですよね。AIもそこを先に整えると使いやすくなります。"
        },
        {
          "id": "B",
          "text": "見た目より運用が詰まる、まさにそこだと思います。制作フローにAIを入れるなら、更新の入口を短くしたいです。"
        },
        {
          "id": "C",
          "text": "AIはWebを置き換えるというより、更新の回路を短くする方向が現実的ですよね。"
        }
      ]
    },
    {
      "id": "fixture-store-meo-003",
      "category": "store_meo",
      "sourcePost": "店舗の口コミ返信と写真更新、毎回地味に手が止まる。",
      "authorContext": {
        "relationshipLevel": "unknown",
        "isTargetAudience": true
      },
      "expectedReplyStrategy": [
        "自然な共感",
        "現場実装の視点を一段追加"
      ],
      "allowedIdentityAngles": [
        "AI業務改善",
        "Web制作からAIツール開発へ移った経験"
      ],
      "avoidIdentityAngles": [
        "関係のないAI業務改善の大きな宣伝"
      ],
      "mustAvoid": [
        "元投稿の要約だけ",
        "過剰な営業CTA"
      ],
      "expectedClaimLevel": "in_development",
      "notes": "店舗運用の省力化に寄せる。",
      "mockReplies": [
        {
          "id": "A",
          "text": "店舗運用って、こういう細かい手間が積み重なりますよね。返信と写真を毎週まわせる形にできるとかなり楽になります。"
        },
        {
          "id": "B",
          "text": "口コミ返信と写真更新は、続けられる形にするのが一番効きますよね。AIはそこを少し軽くする役で使うのが合いそうです。"
        },
        {
          "id": "C",
          "text": "現場だと、投稿より日々の回し方が先に詰まりますよね。そこを減らせると運用が安定します。"
        }
      ]
    },
    {
      "id": "fixture-movie-no-reply-004",
      "category": "offtopic",
      "sourcePost": "最近見た映画が良くて、映像も音楽もずっと残っている。",
      "authorContext": {
        "relationshipLevel": "unknown",
        "isTargetAudience": false
      },
      "expectedReplyStrategy": [
        "無理に返信しない"
      ],
      "allowedIdentityAngles": [],
      "avoidIdentityAngles": [
        "AI業務改善",
        "Web制作からAIツール開発へ移った経験"
      ],
      "mustAvoid": [
        "AI接続",
        "宣伝CTA"
      ],
      "expectedClaimLevel": "none",
      "notes": "shouldReply=false でよい例。",
      "mockReplies": [
        {
          "id": "A",
          "text": "映画の余韻って長く残りますよね。"
        },
        {
          "id": "B",
          "text": "映像と音楽が良い作品は、あとからじわっときますよね。"
        },
        {
          "id": "C",
          "text": "その感覚、わかります。"
        }
      ]
    },
    {
      "id": "fixture-ai-disagree-005",
      "category": "ai_opinion",
      "sourcePost": "AIは全部自動にした方が結局効率いい。",
      "authorContext": {
        "relationshipLevel": "unknown",
        "isTargetAudience": true
      },
      "expectedReplyStrategy": [
        "自然な共感",
        "元投稿の言い換えで終わらない",
        "現場実装の視点を一段追加"
      ],
      "allowedIdentityAngles": [
        "AI業務改善"
      ],
      "avoidIdentityAngles": [
        "MEOの営業"
      ],
      "mustAvoid": [
        "上から目線",
        "説教臭い"
      ],
      "expectedClaimLevel": "low",
      "notes": "人間確認を残す話へ。",
      "mockReplies": [
        {
          "id": "A",
          "text": "効率は上がりますが、途中の確認を残した方が現場では止まりにくいことも多いですよね。"
        },
        {
          "id": "B",
          "text": "全部自動に寄せたくなりますが、更新と例外処理だけは人が見た方が回りやすい場面があります。"
        },
        {
          "id": "C",
          "text": "自動化は強いですが、止まった時に戻れる設計も同じくらい大事だと思っています。"
        }
      ]
    },
    {
      "id": "fixture-devlog-006",
      "category": "devlog",
      "sourcePost": "個人開発は作るより、改善を続ける方が難しい。",
      "authorContext": {
        "relationshipLevel": "unknown",
        "isTargetAudience": true
      },
      "expectedReplyStrategy": [
        "自然な共感",
        "現場実装の視点を一段追加"
      ],
      "allowedIdentityAngles": [
        "Web制作からAIツール開発へ移った経験",
        "AI業務改善"
      ],
      "avoidIdentityAngles": [
        "MEO運用宣伝"
      ],
      "mustAvoid": [
        "一般論だけ"
      ],
      "expectedClaimLevel": "low",
      "notes": "継続改善と運用に接続。",
      "mockReplies": [
        {
          "id": "A",
          "text": "それすごくあります。作るより、改善の回し方を決める方が難しいですよね。"
        },
        {
          "id": "B",
          "text": "個人開発は、実装より改善のループを切らさない方がしんどい気がします。そこを整えると前に進みやすいです。"
        },
        {
          "id": "C",
          "text": "開発の本体って、作った後の更新だと感じることが多いです。運用まで含めて設計したいですね。"
        }
      ]
    },
    {
      "id": "fixture-sns-007",
      "category": "sns_ops",
      "sourcePost": "X運用って、投稿よりも返信の積み上げの方が効く気がする。",
      "authorContext": {
        "relationshipLevel": "unknown",
        "isTargetAudience": true
      },
      "expectedReplyStrategy": [
        "自然な共感",
        "現場実装の視点を一段追加"
      ],
      "allowedIdentityAngles": [
        "SNS運用"
      ],
      "avoidIdentityAngles": [
        "関係のないWeb制作宣伝"
      ],
      "mustAvoid": [
        "プロフィール誘導"
      ],
      "expectedClaimLevel": "verified",
      "notes": "返信運用への理解を示す。",
      "mockReplies": [
        {
          "id": "A",
          "text": "わかります。投稿の量より、ちゃんと返す積み上げの方が関係が育ちやすいですよね。"
        },
        {
          "id": "B",
          "text": "返信は地味ですが、継続するとちゃんと効いてきますよね。運用の温度が見えやすい気がします。"
        },
        {
          "id": "C",
          "text": "X運用は、発信より対話の設計が大事だと感じます。そこを丁寧にやると空気が変わりますよね。"
        }
      ]
    },
    {
      "id": "fixture-relationship-008",
      "category": "human_relation",
      "sourcePost": "人間関係って、正しさよりタイミングの方が難しい。",
      "authorContext": {
        "relationshipLevel": "unknown",
        "isTargetAudience": false
      },
      "expectedReplyStrategy": [
        "自然な共感",
        "無理に専門性を足さない"
      ],
      "allowedIdentityAngles": [],
      "avoidIdentityAngles": [
        "AI業務改善"
      ],
      "mustAvoid": [
        "営業CTA",
        "プロフィール誘導"
      ],
      "expectedClaimLevel": "none",
      "notes": "深追いしない。",
      "mockReplies": [
        {
          "id": "A",
          "text": "ほんとに、正しさだけでは片付かないことありますよね。"
        },
        {
          "id": "B",
          "text": "タイミングが合わないと、伝わるものも伝わりにくいですよね。"
        },
        {
          "id": "C",
          "text": "その難しさ、ありますよね。"
        }
      ]
    },
    {
      "id": "fixture-strong-claim-009",
      "category": "misinfo_risk",
      "sourcePost": "この手法なら誰でもすぐ売上が2倍になる。",
      "authorContext": {
        "relationshipLevel": "unknown",
        "isTargetAudience": true
      },
      "expectedReplyStrategy": [
        "反論・補足が必要",
        "根拠を安易に肯定しない"
      ],
      "allowedIdentityAngles": [
        "AI業務改善"
      ],
      "avoidIdentityAngles": [
        "成果断定の宣伝"
      ],
      "mustAvoid": [
        "根拠のない断定"
      ],
      "expectedClaimLevel": "low",
      "notes": "断定に乗らない。",
      "mockReplies": [
        {
          "id": "A",
          "text": "そこは少し慎重に見た方がよさそうです。実際は条件次第でかなり差が出ますよね。"
        },
        {
          "id": "B",
          "text": "売上の話は再現条件がかなり大事ですよね。現場によって効き方が変わりやすいです。"
        },
        {
          "id": "C",
          "text": "すぐ倍、みたいな断定は危ういですよね。前提条件を分けて見る方が実務では役立ちます。"
        }
      ]
    },
    {
      "id": "fixture-selfpromo-010",
      "category": "promo_risk",
      "sourcePost": "AIツールを探しているなら、ぜひ連絡ください。",
      "authorContext": {
        "relationshipLevel": "unknown",
        "isTargetAudience": true
      },
      "expectedReplyStrategy": [
        "宣伝接続すると不自然な投稿"
      ],
      "allowedIdentityAngles": [],
      "avoidIdentityAngles": [
        "無理なプロフィール誘導"
      ],
      "mustAvoid": [
        "営業CTA",
        "プロフィール誘導"
      ],
      "expectedClaimLevel": "none",
      "notes": "返信しないか短く流す。",
      "mockReplies": [
        {
          "id": "A",
          "text": "用途次第で選びたいところですね。"
        },
        {
          "id": "B",
          "text": "まずは何を自動化したいかで変わりそうです。"
        },
        {
          "id": "C",
          "text": "目的が合うものを選びたいですね。"
        }
      ]
    },
    {
      "id": "fixture-ai-dev-011",
      "category": "ai_tool_dev",
      "sourcePost": "AIツール開発は、モデルよりUIが難しい気がしてきた。",
      "authorContext": {
        "relationshipLevel": "unknown",
        "isTargetAudience": true
      },
      "expectedReplyStrategy": [
        "自然な共感",
        "現場実装の視点を一段追加"
      ],
      "allowedIdentityAngles": [
        "Web制作からAIツール開発へ移った経験",
        "AI業務改善"
      ],
      "avoidIdentityAngles": [
        "MEO"
      ],
      "mustAvoid": [
        "一般論だけ"
      ],
      "expectedClaimLevel": "implemented",
      "notes": "UI/運用の詰まりを返す。",
      "mockReplies": [
        {
          "id": "A",
          "text": "それはかなりあります。モデルより、実際に触るUIと運用導線の方が詰まりやすいですよね。"
        },
        {
          "id": "B",
          "text": "UIが難しい、まさにそこだと思います。現場では入力の少なさや戻りやすさが効きます。"
        },
        {
          "id": "C",
          "text": "AI開発は精度より使い続けられる形にする方が難しい気がします。"
        }
      ]
    },
    {
      "id": "fixture-work-life-012",
      "category": "life_work",
      "sourcePost": "継続って、やる気より仕組みの方が大事かもしれない。",
      "authorContext": {
        "relationshipLevel": "unknown",
        "isTargetAudience": true
      },
      "expectedReplyStrategy": [
        "自然な共感",
        "現場実装の視点を一段追加"
      ],
      "allowedIdentityAngles": [
        "AI業務改善"
      ],
      "avoidIdentityAngles": [
        "MEO"
      ],
      "mustAvoid": [
        "説教臭い"
      ],
      "expectedClaimLevel": "low",
      "notes": "仕組み化の視点。",
      "mockReplies": [
        {
          "id": "A",
          "text": "ほんとそうですね。続くかどうかは、気合いより仕組みでかなり変わります。"
        },
        {
          "id": "B",
          "text": "継続は意思より設計ですよね。小さく回る形にすると続けやすいです。"
        },
        {
          "id": "C",
          "text": "やる気頼みだと波がありますもんね。仕組みに落とした方が安定します。"
        }
      ]
    },
    {
      "id": "fixture-question-013",
      "category": "question",
      "sourcePost": "こういう時、みんなどう判断してるんだろう。",
      "authorContext": {
        "relationshipLevel": "unknown",
        "isTargetAudience": false
      },
      "expectedReplyStrategy": [
        "無理に専門性を足さない"
      ],
      "allowedIdentityAngles": [],
      "avoidIdentityAngles": [
        "AI業務改善"
      ],
      "mustAvoid": [
        "プロフィール誘導"
      ],
      "expectedClaimLevel": "none",
      "notes": "問いかけに寄り添うだけでよい。",
      "mockReplies": [
        {
          "id": "A",
          "text": "判断むずかしいですよね。"
        },
        {
          "id": "B",
          "text": "みんなの基準が知りたいところです。"
        },
        {
          "id": "C",
          "text": "状況次第でかなり変わりそうですよね。"
        }
      ]
    },
    {
      "id": "fixture-avoid-misread-014",
      "category": "clarification_needed",
      "sourcePost": "実は先に人手で整える方が早い場面もある。",
      "authorContext": {
        "relationshipLevel": "unknown",
        "isTargetAudience": true
      },
      "expectedReplyStrategy": [
        "反論・補足が必要",
        "読み違えない"
      ],
      "allowedIdentityAngles": [
        "AI業務改善"
      ],
      "avoidIdentityAngles": [
        "無理な自動化"
      ],
      "mustAvoid": [
        "元投稿の言い換えだけ"
      ],
      "expectedClaimLevel": "low",
      "notes": "人手の意味を補足する。",
      "mockReplies": [
        {
          "id": "A",
          "text": "そこ、かなりありますね。先に人手で整えた方が結果的に早い場面は多いと思います。"
        },
        {
          "id": "B",
          "text": "自動化したくなりますが、最初は人手で整えた方が回りやすいことありますよね。"
        },
        {
          "id": "C",
          "text": "人手を挟む方がむしろ近道なこと、ありますよね。"
        }
      ]
    },
    {
      "id": "fixture-general-015",
      "category": "general_work",
      "sourcePost": "仕事の進め方って、結局コミュニケーション次第な気がする。",
      "authorContext": {
        "relationshipLevel": "unknown",
        "isTargetAudience": true
      },
      "expectedReplyStrategy": [
        "自然な共感",
        "現場実装の視点を一段追加"
      ],
      "allowedIdentityAngles": [
        "AI業務改善"
      ],
      "avoidIdentityAngles": [
        "MEOの宣伝"
      ],
      "mustAvoid": [
        "一般論すぎる"
      ],
      "expectedClaimLevel": "low",
      "notes": "実務の接続だけ少し足す。",
      "mockReplies": [
        {
          "id": "A",
          "text": "本当にそうですね。仕組みより先に、伝わり方で止まることが多い気がします。"
        },
        {
          "id": "B",
          "text": "コミュニケーションの詰まりを減らすだけで、仕事の流れってかなり変わりますよね。"
        },
        {
          "id": "C",
          "text": "仕事は結局、人のやり取りで詰まりやすいので、そこを軽くする設計が大事だと思います。"
        }
      ]
    }
  ],
  "checksum": "21ac77f9a8ee530ef52f086bea75bd375f959559849110583e2ad7ba7fc4c1ca"
};

module.exports = data;
